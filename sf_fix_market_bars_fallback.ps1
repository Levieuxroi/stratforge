Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "=== Fix /api/market/bars: Binance 451 -> fallback CryptoCompare ===" -ForegroundColor Cyan
Set-Location "C:\Dev\stratforge"

# Detect APPROOT (one single block!)
$APPROOT = $null
if (Test-Path ".\src\app") { $APPROOT = ".\src\app" }
elseif (Test-Path ".\app") { $APPROOT = ".\app" }
else { throw "ERREUR: ni .\src\app ni .\app trouvés dans $(Get-Location)" }

Write-Host "OK: APPROOT = $APPROOT" -ForegroundColor Green

$target = Join-Path $APPROOT "api\market\bars\route.ts"
$parent = Split-Path $target -Parent
New-Item -ItemType Directory -Force -Path $parent | Out-Null
Write-Host "OK: target = $target" -ForegroundColor Green

$code = @'
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["fra1"]; // try to keep execution in EU (helps Binance)

type Bar = { t: number; o: number; h: number; l: number; c: number };

function toNum(x: any, fallback = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function normSymbol(s: any): string {
  return String(s || "BTCUSDT").toUpperCase().replace(/[-/]/g, "");
}

function normTimeframe(tf: any): string {
  return String(tf || "1h").trim();
}

function clampLimit(x: any): number {
  const n = Number(x);
  const lim = Number.isFinite(n) ? n : 200;
  return Math.max(10, Math.min(1500, Math.trunc(lim)));
}

function intervalToBinance(tf: string): string {
  const map: Record<string, string> = {
    "1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m",
    "1h":"1h","2h":"2h","4h":"4h","6h":"6h","8h":"8h","12h":"12h",
    "1d":"1d","3d":"3d","1w":"1w","1M":"1M"
  };
  return map[tf] || "1h";
}

function parseSymbol(symbol: string): { base: string; quote: string } {
  const s = symbol.toUpperCase().replace(/[-/]/g, "");
  const quotes = ["USDT","USDC","BUSD","USD","EUR","BTC","ETH"];
  for (const q of quotes.sort((a,b)=>b.length-a.length)) {
    if (s.endsWith(q) && s.length > q.length) return { base: s.slice(0, -q.length), quote: q };
  }
  return { base: s, quote: "USDT" };
}

function tfToCryptoCompare(tf: string): { endpoint: "histominute"|"histohour"|"histoday"; aggregate: number } {
  const s = (tf || "").trim().toLowerCase();

  // minutes
  let m = s.match(/^(\d+)\s*m$/);
  if (m) return { endpoint: "histominute", aggregate: Math.max(1, Math.min(1440, parseInt(m[1], 10))) };

  // hours
  m = s.match(/^(\d+)\s*h$/);
  if (m) return { endpoint: "histohour", aggregate: Math.max(1, Math.min(168, parseInt(m[1], 10))) };

  // days
  m = s.match(/^(\d+)\s*d$/);
  if (m) return { endpoint: "histoday", aggregate: Math.max(1, Math.min(365, parseInt(m[1], 10))) };

  // week/month fallback
  if (s === "1w") return { endpoint: "histoday", aggregate: 7 };
  if (s === "1m" || s === "1mo" || s === "1month") return { endpoint: "histoday", aggregate: 30 };

  return { endpoint: "histohour", aggregate: 1 };
}

async function fetchBinance(symbol: string, timeframe: string, limit: number) {
  const interval = intervalToBinance(timeframe);
  const url =
    "https://api.binance.com/api/v3/klines?symbol=" + encodeURIComponent(symbol) +
    "&interval=" + encodeURIComponent(interval) +
    "&limit=" + encodeURIComponent(String(limit));

  const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": "StratForge/1.0" } });
  if (!r.ok) throw new Error(`Binance ${r.status}`);

  const raw = await r.json();
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("Binance: invalid response");

  const bars: Bar[] = raw.map((k: any[]) => ({
    t: toNum(k[0]), // ms already
    o: toNum(k[1]),
    h: toNum(k[2]),
    l: toNum(k[3]),
    c: toNum(k[4]),
  }));

  return { provider: "binance", bars };
}

async function fetchCryptoCompare(symbol: string, timeframe: string, limit: number) {
  const { base, quote } = parseSymbol(symbol);
  const { endpoint, aggregate } = tfToCryptoCompare(timeframe);

  const url =
    "https://min-api.cryptocompare.com/data/v2/" + endpoint +
    "?fsym=" + encodeURIComponent(base) +
    "&tsym=" + encodeURIComponent(quote) +
    "&limit=" + encodeURIComponent(String(limit)) +
    "&aggregate=" + encodeURIComponent(String(aggregate));

  const headers: Record<string, string> = {};
  const key = process.env.CRYPTOCOMPARE_API_KEY || "";
  if (key) headers["authorization"] = "Apikey " + key;

  const r = await fetch(url, { cache: "no-store", headers });
  if (!r.ok) throw new Error(`CryptoCompare ${r.status}`);

  const j = await r.json();
  const arr = j?.Data?.Data;
  if (!Array.isArray(arr) || arr.length === 0) throw new Error("CryptoCompare: invalid response");

  const bars: Bar[] = arr.map((b: any) => ({
    t: toNum(b.time) * 1000, // seconds -> ms
    o: toNum(b.open),
    h: toNum(b.high),
    l: toNum(b.low),
    c: toNum(b.close),
  }));

  return { provider: "cryptocompare", bars };
}

async function getBars(symbol: string, timeframe: string, limit: number) {
  try {
    return await fetchBinance(symbol, timeframe, limit);
  } catch (e: any) {
    // Binance 451 is common on Vercel US regions -> fallback
    return await fetchCryptoCompare(symbol, timeframe, limit);
  }
}

function parseBodyLoose(raw: string): any {
  const s = (raw ?? "").trim();
  if (!s) return {};
  try { return JSON.parse(s); } catch {}
  // urlencoded fallback: "symbol=...&timeframe=...&limit=..."
  if (s.includes("=") && s.includes("&")) {
    const sp = new URLSearchParams(s);
    return { symbol: sp.get("symbol"), timeframe: sp.get("timeframe"), limit: sp.get("limit") };
  }
  return {};
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = normSymbol(url.searchParams.get("symbol"));
    const timeframe = normTimeframe(url.searchParams.get("timeframe"));
    const limit = clampLimit(url.searchParams.get("limit"));
    const out = await getBars(symbol, timeframe, limit);
    return Response.json(out);
  } catch (e: any) {
    return Response.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const body = parseBodyLoose(raw);
    const symbol = normSymbol(body?.symbol);
    const timeframe = normTimeframe(body?.timeframe);
    const limit = clampLimit(body?.limit);
    const out = await getBars(symbol, timeframe, limit);
    return Response.json(out);
  } catch (e: any) {
    return Response.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
'@

[System.IO.File]::WriteAllText($target, $code, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "OK: wrote route.ts" -ForegroundColor Green

git add -- $target | Out-Null
$staged = git diff --cached --name-only
if (-not $staged) {
  Write-Host "OK: nothing staged (no change?)" -ForegroundColor Yellow
  exit 0
}
git commit -m "fix: market/bars fallback CryptoCompare when Binance blocked" | Out-Null
git push | Out-Null
Write-Host "OK: pushed" -ForegroundColor Green
