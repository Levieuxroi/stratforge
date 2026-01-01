Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "=== StratForge: fix /api/market/bars ===" -ForegroundColor Cyan
Set-Location "C:\Dev\stratforge"

# 1) Detect APPROOT (IMPORTANT: one single if/elseif/else block)
$APPROOT = $null
if (Test-Path ".\src\app") {
  $APPROOT = ".\src\app"
}
elseif (Test-Path ".\app") {
  $APPROOT = ".\app"
}
else {
  throw "ERREUR: ni .\src\app ni .\app trouvés dans $(Get-Location)"
}
Write-Host "OK: APPROOT = $APPROOT" -ForegroundColor Green

# 2) Target file
$target = Join-Path $APPROOT "api\market\bars\route.ts"
$parent = Split-Path $target -Parent
New-Item -ItemType Directory -Force -Path $parent | Out-Null
Write-Host "OK: target = $target" -ForegroundColor Green

# 3) route.ts content (simple + robuste)
$code = @'
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const lim = Number.isFinite(n) ? n : 500;
  return Math.max(50, Math.min(1500, Math.trunc(lim)));
}

function intervalToBinance(tf: string): string {
  const map: Record<string, string> = {
    "1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m",
    "1h":"1h","2h":"2h","4h":"4h","6h":"6h","8h":"8h","12h":"12h",
    "1d":"1d","3d":"3d","1w":"1w","1M":"1M"
  };
  return map[tf] || "1h";
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
    t: toNum(k[0]),
    o: toNum(k[1]),
    h: toNum(k[2]),
    l: toNum(k[3]),
    c: toNum(k[4]),
  }));

  return { provider: "binance", bars };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = normSymbol(url.searchParams.get("symbol"));
    const timeframe = normTimeframe(url.searchParams.get("timeframe"));
    const limit = clampLimit(url.searchParams.get("limit"));
    const out = await fetchBinance(symbol, timeframe, limit);
    return Response.json(out);
  } catch (e: any) {
    return Response.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (!raw || !raw.trim()) {
      return Response.json({ error: "Missing JSON body" }, { status: 400 });
    }

    let body: any = null;

    // 1) normal JSON
    try {
      body = JSON.parse(raw);
    } catch {
      // 2) fallback: urlencoded "symbol=...&timeframe=...&limit=..."
      if (raw.includes("=") && raw.includes("&")) {
        const sp = new URLSearchParams(raw);
        body = {
          symbol: sp.get("symbol"),
          timeframe: sp.get("timeframe"),
          limit: sp.get("limit"),
        };
      } else {
        return Response.json({ error: "Invalid JSON body", received: raw.slice(0, 200) }, { status: 400 });
      }
    }

    const symbol = normSymbol(body?.symbol);
    const timeframe = normTimeframe(body?.timeframe);
    const limit = clampLimit(body?.limit);

    const out = await fetchBinance(symbol, timeframe, limit);
    return Response.json(out);
  } catch (e: any) {
    return Response.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
'@

# 4) Write file as UTF-8 (no BOM)
[System.IO.File]::WriteAllText($target, $code, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "OK: wrote route.ts" -ForegroundColor Green

# 5) Quick local verification
Write-Host "=== Preview (first 5 lines) ===" -ForegroundColor Cyan
Get-Content $target -TotalCount 5

# 6) Git commit/push
git add -- $target | Out-Null
$staged = git diff --cached --name-only
if (-not $staged) {
  Write-Host "OK: nothing staged (no change?)" -ForegroundColor Yellow
  exit 0
}

git commit -m "fix: market/bars GET+POST (binance)" | Out-Null
git push | Out-Null
Write-Host "OK: pushed" -ForegroundColor Green
