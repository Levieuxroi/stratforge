export const runtime = "nodejs";

function toNumber(x: any, fallback = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

type Bar = { t: number; o: number; h: number; l: number; c: number };

function intervalToBinance(tf: string): string {
  const x = (tf || "").trim();
  const map: Record<string, string> = {
    "1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m",
    "1h":"1h","2h":"2h","4h":"4h","6h":"6h","8h":"8h","12h":"12h",
    "1d":"1d","3d":"3d","1w":"1w","1M":"1M"
  };
  return map[x] || "1h";
}

function intervalToCryptoCompare(tf: string): { endpoint: "histominute" | "histohour" | "histoday"; aggregate: number } {
  const s = (tf || "").trim().toLowerCase();
  let m = s.match(/^(\d+)\s*m$/);
  if (m) return { endpoint: "histominute", aggregate: Math.max(1, Math.min(1440, parseInt(m[1], 10))) };
  m = s.match(/^(\d+)\s*h$/);
  if (m) return { endpoint: "histohour", aggregate: Math.max(1, Math.min(168, parseInt(m[1], 10))) };
  m = s.match(/^(\d+)\s*d$/);
  if (m) return { endpoint: "histoday", aggregate: Math.max(1, Math.min(365, parseInt(m[1], 10))) };
  return { endpoint: "histohour", aggregate: 1 };
}

function parseSymbol(symbol: string): { base: string; quote: string } {
  const s = symbol.toUpperCase().replace("-", "").replace("/", "");
  const quotes = ["USDT","USDC","BUSD","USD","EUR","BTC","ETH"];
  for (const q of quotes.sort((a,b)=>b.length-a.length)) {
    if (s.endsWith(q) && s.length > q.length) return { base: s.slice(0, -q.length), quote: q };
  }
  return { base: s, quote: "USDT" };
}

async function fetchBarsFromBinance(symbol: string, timeframe: string, limit: number) {
  const interval = intervalToBinance(timeframe);
  const url = "https://api.binance.com/api/v3/klines?symbol=" + encodeURIComponent(symbol) +
    "&interval=" + encodeURIComponent(interval) + "&limit=" + encodeURIComponent(String(limit));

  const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": "StratForge/1.0" } });
  if (!r.ok) throw new Error("Binance " + r.status);

  const raw = await r.json();
  if (!Array.isArray(raw) || raw.length < 10) throw new Error("Binance not enough data");

  const bars: Bar[] = raw.map((k: any[]) => ({
    t: toNumber(k[0]),
    o: toNumber(k[1]),
    h: toNumber(k[2]),
    l: toNumber(k[3]),
    c: toNumber(k[4])
  }));

  return { provider: "binance", bars };
}

async function fetchBarsFromCryptoCompare(symbol: string, timeframe: string, limit: number) {
  const { base, quote } = parseSymbol(symbol);
  const { endpoint, aggregate } = intervalToCryptoCompare(timeframe);

  const url = "https://min-api.cryptocompare.com/data/v2/" + endpoint +
    "?fsym=" + encodeURIComponent(base) + "&tsym=" + encodeURIComponent(quote) +
    "&limit=" + encodeURIComponent(String(limit)) + "&aggregate=" + encodeURIComponent(String(aggregate));

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("CryptoCompare " + r.status);

  const j = await r.json();
  const arr = j?.Data?.Data;
  if (!Array.isArray(arr) || arr.length < 10) throw new Error("CryptoCompare not enough data");

  const bars: Bar[] = arr.map((b: any) => ({
    t: toNumber(b.time) * 1000,
    o: toNumber(b.open),
    h: toNumber(b.high),
    l: toNumber(b.low),
    c: toNumber(b.close)
  }));

  return { provider: "cryptocompare", bars };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const symbol = String(body.symbol || "BTCUSDT").toUpperCase().replace("-", "").replace("/", "");
    const timeframe = String(body.timeframe || "1h");
    const limit = Math.max(50, Math.min(1500, toNumber(body.limit, 500)));

    try {
      const out = await fetchBarsFromBinance(symbol, timeframe, limit);
      return Response.json(out);
    } catch {
      const out2 = await fetchBarsFromCryptoCompare(symbol, timeframe, limit);
      return Response.json(out2);
    }
  } catch (e: any) {
    return Response.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
