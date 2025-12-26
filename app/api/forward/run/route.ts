export const runtime = "nodejs";

import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

type Bar = { t: number; o: number; h: number; l: number; c: number };

function toNumber(x: any, fallback = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function computeRSI(closes: number[], length: number): (number | null)[] {
  const rsi: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < length + 1) return rsi;

  let gain = 0;
  let loss = 0;

  for (let i = 1; i <= length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss += -diff;
  }

  gain /= length;
  loss /= length;

  let rs = loss === 0 ? Infinity : gain / loss;
  rsi[length] = 100 - 100 / (1 + rs);

  for (let i = length + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;

    gain = (gain * (length - 1) + g) / length;
    loss = (loss * (length - 1) + l) / length;

    rs = loss === 0 ? Infinity : gain / loss;
    rsi[i] = 100 - 100 / (1 + rs);
  }

  return rsi;
}

function safeOp(op: string): "<" | "<=" | ">" | ">=" {
  const o = (op || "").trim();
  if (o === "<" || o === "<=" || o === ">" || o === ">=") return o;
  return "<";
}

function cmp(a: number, op: string, b: number): boolean {
  const o = safeOp(op);
  if (o === "<") return a < b;
  if (o === "<=") return a <= b;
  if (o === ">") return a > b;
  return a >= b;
}

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

async function fetchBars(symbol: string, timeframe: string, limit: number): Promise<{ provider: string; bars: Bar[] }> {
  // Binance first
  try {
    const interval = intervalToBinance(timeframe);
    const url =
      "https://api.binance.com/api/v3/klines?symbol=" +
      encodeURIComponent(symbol) +
      "&interval=" +
      encodeURIComponent(interval) +
      "&limit=" +
      encodeURIComponent(String(limit));

    const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": "StratForge/1.0" } });
    if (!r.ok) throw new Error("Binance " + r.status);

    const raw = await r.json();
    if (!Array.isArray(raw) || raw.length < 50) throw new Error("Binance not enough data");

    const bars: Bar[] = raw.map((k: any[]) => ({
      t: toNumber(k[0]),
      o: toNumber(k[1]),
      h: toNumber(k[2]),
      l: toNumber(k[3]),
      c: toNumber(k[4])
    }));

    return { provider: "binance", bars };
  } catch {
    // fallback CryptoCompare
    const { base, quote } = parseSymbol(symbol);
    const { endpoint, aggregate } = intervalToCryptoCompare(timeframe);

    const url =
      "https://min-api.cryptocompare.com/data/v2/" +
      endpoint +
      "?fsym=" +
      encodeURIComponent(base) +
      "&tsym=" +
      encodeURIComponent(quote) +
      "&limit=" +
      encodeURIComponent(String(limit)) +
      "&aggregate=" +
      encodeURIComponent(String(aggregate));

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("CryptoCompare " + r.status);

    const j = await r.json();
    const arr = j?.Data?.Data;
    if (!Array.isArray(arr) || arr.length < 50) throw new Error("CryptoCompare not enough data");

    const bars: Bar[] = arr.map((b: any) => ({
      t: toNumber(b.time) * 1000,
      o: toNumber(b.open),
      h: toNumber(b.high),
      l: toNumber(b.low),
      c: toNumber(b.close)
    }));

    return { provider: "cryptocompare", bars };
  }
}

function getRSIRules(def: any) {
  const entry = def?.rules?.entry?.all || [];
  const exit = def?.rules?.exit?.any || [];

  let len = 14;
  let entryOp = "<";
  let entryVal = 30;
  let exitOp = ">";
  let exitVal = 70;

  for (const r of entry) {
    if (r?.type === "indicator" && String(r?.name || "").toUpperCase() === "RSI") {
      len = Math.max(2, Math.min(100, toNumber(r.length, 14)));
      entryOp = String(r.op ?? entryOp);
      entryVal = toNumber(r.value, entryVal);
      break;
    }
  }
  for (const r of exit) {
    if (r?.type === "indicator" && String(r?.name || "").toUpperCase() === "RSI") {
      len = Math.max(2, Math.min(100, toNumber(r.length, 14)));
      exitOp = String(r.op ?? exitOp);
      exitVal = toNumber(r.value, exitVal);
      break;
    }
  }

  return { len, entryOp, entryVal, exitOp, exitVal };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    const required = process.env.CRON_SECRET;

    if (!required || !secret || secret !== required) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = Date.now();

    const { data: cfgs, error: cfgErr } = await supabaseAdmin
      .from("forward_configs")
      .select("id,user_id,strategy_id,is_enabled,frequency_seconds,last_checked_at")
      .eq("is_enabled", true);

    if (cfgErr) return Response.json({ error: cfgErr.message }, { status: 500 });

    let processed = 0;
    let inserted = 0;
    let skipped = 0;
    const errors: any[] = [];

    for (const cfg of cfgs || []) {
      try {
        const freq = Math.max(60, Math.min(3600, Number(cfg.frequency_seconds || 300)));
        const last = cfg.last_checked_at ? Date.parse(cfg.last_checked_at) : 0;

        if (last && now - last < freq * 1000) {
          skipped += 1;
          continue;
        }

        // load strategy
        const { data: strat, error: sErr } = await supabaseAdmin
          .from("strategies")
          .select("id,user_id,name,symbol,timeframe,definition")
          .eq("id", cfg.strategy_id)
          .single();

        if (sErr || !strat) throw new Error(sErr?.message || "Strategy not found");

        const symbol = String(strat.symbol || "BTCUSDT").toUpperCase().replace("-", "").replace("/", "");
        const timeframe = String(strat.timeframe || "1h");
        const def = strat.definition;

        const { provider, bars } = await fetchBars(symbol, timeframe, 300);
        const closes = bars.map((b) => b.c);

        const { len, entryOp, entryVal, exitOp, exitVal } = getRSIRules(def);
        const rsi = computeRSI(closes, len);

        const lastIdx = bars.length - 1;
        const lastBar = bars[lastIdx];
        const lastRSI = rsi[lastIdx];
        if (lastRSI === null) throw new Error("RSI not ready");

        // in-position based on last signal
        const { data: lastSig } = await supabaseAdmin
          .from("signals")
          .select("signal_type")
          .eq("strategy_id", strat.id)
          .order("t", { ascending: false })
          .limit(1);

        const inPos = (lastSig && lastSig[0]?.signal_type === "ENTRY") ? true : false;

        let newSignal: "ENTRY" | "EXIT" | null = null;
        if (!inPos) {
          if (cmp(lastRSI, entryOp, entryVal)) newSignal = "ENTRY";
        } else {
          if (cmp(lastRSI, exitOp, exitVal)) newSignal = "EXIT";
        }

        if (newSignal) {
          const ins = await supabaseAdmin.from("signals").insert({
            user_id: cfg.user_id,
            strategy_id: strat.id,
            t: new Date(lastBar.t).toISOString(),
            signal_type: newSignal,
            price: lastBar.c,
            meta: { provider, rsi: lastRSI, timeframe }
          });

          if (ins.error) {
            const msg = String(ins.error.message || "");
            // ignore duplicates (unique index)
            if (!msg.toLowerCase().includes("duplicate")) throw new Error(msg);
          } else {
            inserted += 1;
          }
        }

        await supabaseAdmin
          .from("forward_configs")
          .update({ last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", cfg.id);

        processed += 1;
      } catch (e: any) {
        errors.push({ strategy_id: cfg.strategy_id, error: e?.message || String(e) });
      }
    }

    return Response.json({ ok: true, processed, skipped, inserted, errorsCount: errors.length, errors });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
