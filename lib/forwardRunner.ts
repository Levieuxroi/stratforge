import { supabaseAdmin } from "./supabaseAdmin";

type StrategyRow = {
  id: string;
  user_id: string;
  name: string;
  symbol: string;
  timeframe: string;
  definition: any;
};

function tfToBinanceInterval(tf: string): string {
  const t = (tf || "").trim();
  const allowed = new Set([
    "1m","3m","5m","15m","30m",
    "1h","2h","4h","6h","8h","12h",
    "1d","3d","1w","1M"
  ]);
  if (allowed.has(t)) return t;
  // fallback
  return "1h";
}

async function fetchKlines(symbol: string, interval: string, limit: number) {
  const sym = symbol.toUpperCase();
  const intv = interval;

  // Futures endpoints (avoid 451 via binance.vision first)
  const urls = [
    `https://data-api.binance.vision/fapi/v1/klines?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(intv)}&limit=${limit}`,
    `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(intv)}&limit=${limit}`,
    // Spot fallback
    `https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(intv)}&limit=${limit}`,
    `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(intv)}&limit=${limit}`
  ];

  let lastErr: any = null;

  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        lastErr = new Error(`HTTP ${r.status} ${r.statusText}`);
        continue;
      }
      const j = await r.json();
      if (!Array.isArray(j) || j.length < 20) {
        lastErr = new Error("Bad klines payload");
        continue;
      }
      return j;
    } catch (e: any) {
      lastErr = e;
    }
  }

  throw lastErr || new Error("Binance fetch failed");
}

function rsiWilder(closes: number[], period = 14): number[] {
  if (closes.length < period + 2) return [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gains += ch;
    else losses -= ch;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  const out: number[] = [];
  // first RSI at index = period
  let rs = avgLoss === 0 ? 999999 : avgGain / avgLoss;
  out.push(100 - 100 / (1 + rs));

  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 999999 : avgGain / avgLoss;
    out.push(100 - 100 / (1 + rs));
  }

  return out;
}

export async function runForwardForUser(user_id: string, strategy_id?: string | null) {
  const nowIso = new Date().toISOString();

  // 1) Load config if needed
  let sid = strategy_id || null;
  if (!sid) {
    const { data: cfg, error: cErr } = await supabaseAdmin
      .from("forward_configs")
      .select("strategy_id")
      .eq("user_id", user_id)
      .maybeSingle();

    if (cErr) {
      // still update last_error
      await supabaseAdmin
        .from("forward_configs")
        .upsert({ user_id, last_run_at: nowIso, last_error: cErr.message, updated_at: nowIso }, { onConflict: "user_id" });
      return { ok: false, error: cErr.message };
    }

    sid = (cfg as any)?.strategy_id || null;
  }

  if (!sid) {
    await supabaseAdmin
      .from("forward_configs")
      .upsert({ user_id, last_run_at: nowIso, last_error: "No strategy selected", updated_at: nowIso }, { onConflict: "user_id" });
    return { ok: false, error: "No strategy selected" };
  }

  // 2) Load strategy
  const { data: strat, error: sErr } = await supabaseAdmin
    .from("strategies")
    .select("id,user_id,name,symbol,timeframe,definition")
    .eq("id", sid)
    .eq("user_id", user_id)
    .maybeSingle();

  if (sErr || !strat) {
    const msg = sErr?.message || "Strategy not found";
    await supabaseAdmin
      .from("forward_configs")
      .upsert({ user_id, last_run_at: nowIso, last_error: msg, updated_at: nowIso }, { onConflict: "user_id" });
    return { ok: false, error: msg };
  }

  const row = strat as any as StrategyRow;
  const symbol = row.symbol || "BTCUSDT";
  const interval = tfToBinanceInterval(row.timeframe || "1h");

  // 3) Fetch market data
  let klines: any[] = [];
  try {
    klines = await fetchKlines(symbol, interval, 200);
  } catch (e: any) {
    const msg = `Binance fetch failed: ${e?.message || String(e)}`;
    await supabaseAdmin
      .from("forward_configs")
      .upsert({ user_id, last_run_at: nowIso, last_error: msg, updated_at: nowIso }, { onConflict: "user_id" });
    return { ok: false, error: msg };
  }

  const closes = klines.map((k) => Number(k?.[4])).filter((x) => Number.isFinite(x));
  const rsi = rsiWilder(closes, 14);

  if (rsi.length < 2) {
    const msg = "Not enough data to compute RSI";
    await supabaseAdmin
      .from("forward_configs")
      .upsert({ user_id, last_run_at: nowIso, last_error: msg, updated_at: nowIso }, { onConflict: "user_id" });
    return { ok: false, error: msg };
  }

  const prev = rsi[rsi.length - 2];
  const last = rsi[rsi.length - 1];
  const price = closes[closes.length - 1];

  // Simple RSI Reversal MVP
  let side: "LONG" | "SHORT" | null = null;
  if (prev < 30 && last >= 30) side = "LONG";
  if (prev > 70 && last <= 70) side = "SHORT";

  // 4) Insert signal if any (best-effort)
  let signalInsertError: string | null = null;
  if (side) {
    const payload: any = {
      user_id,
      strategy_id: row.id,
      symbol,
      timeframe: interval,
      side,
      price,
      created_at: nowIso,
      meta: { source: "forward", rsi_prev: prev, rsi_last: last }
    };

    const ins = await supabaseAdmin.from("signals").insert(payload);
    if (ins.error) {
      // do not fail the run, but keep trace
      signalInsertError = `signals insert failed: ${ins.error.message}`;
    }
  }

  // 5) Update forward_configs run status
  const last_error = signalInsertError ? signalInsertError : null;

  await supabaseAdmin
    .from("forward_configs")
    .upsert(
      {
        user_id,
        last_run_at: nowIso,
        last_error,
        updated_at: nowIso
      },
      { onConflict: "user_id" }
    );

  return { ok: true, user_id, strategy_id: row.id, symbol, timeframe: interval, price, rsi_prev: prev, rsi_last: last, side };
}
