export const runtime = "nodejs";

type Bar = {
  t: number; // timestamp ms
  o: number;
  h: number;
  l: number;
  c: number;
};

function toNumber(x: any, fallback = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function computeRSI(closes: number[], length: number): (number | null)[] {
  const rsi: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < length + 1) return rsi;

  let gain = 0;
  let loss = 0;

  // initial average gain/loss
  for (let i = 1; i <= length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss += -diff;
  }

  gain /= length;
  loss /= length;

  let rs = loss === 0 ? Infinity : gain / loss;
  rsi[length] = 100 - 100 / (1 + rs);

  // Wilder smoothing
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

function intervalToBinance(tf: string): string {
  const x = (tf || "").trim();
  const map: Record<string, string> = {
    "1m": "1m",
    "3m": "3m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1h",
    "2h": "2h",
    "4h": "4h",
    "6h": "6h",
    "8h": "8h",
    "12h": "12h",
    "1d": "1d",
    "3d": "3d",
    "1w": "1w",
    "1M": "1M"
  };
  return map[x] || "1h";
}

function safeOp(op: string): "<" | "<=" | ">" | ">=" | "==" | "!=" {
  const o = (op || "").trim();
  if (o === "<" || o === "<=" || o === ">" || o === ">=" || o === "==" || o === "!=") return o;
  return "==";
}

function cmp(a: number, op: string, b: number): boolean {
  const o = safeOp(op);
  if (o === "<") return a < b;
  if (o === "<=") return a <= b;
  if (o === ">") return a > b;
  if (o === ">=") return a >= b;
  if (o === "==") return a === b;
  return a !== b;
}

function maxDrawdown(equity: number[]): number {
  if (equity.length === 0) return 0;
  let peak = equity[0];
  let mdd = 0;
  for (const x of equity) {
    if (x > peak) peak = x;
    const dd = peak > 0 ? (peak - x) / peak : 0;
    if (dd > mdd) mdd = dd;
  }
  return mdd;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const symbol = String(body.symbol || "BTCUSDT").toUpperCase().replace("-", "").replace("/", "");
    const timeframe = String(body.timeframe || "1h");
    const definition = body.definition || null;

    const initialCapital = toNumber(body.initialCapital, 1000);
    const barsLimit = Math.max(200, Math.min(1500, toNumber(body.barsLimit, 1000)));

    if (!definition || typeof definition !== "object") {
      return Response.json({ error: "Missing definition (JSON) in request body." }, { status: 400 });
    }

    // --- fetch klines (Binance Spot public) ---
    const interval = intervalToBinance(timeframe);
    const url =
      "https://api.binance.com/api/v3/klines?symbol=" +
      encodeURIComponent(symbol) +
      "&interval=" +
      encodeURIComponent(interval) +
      "&limit=" +
      encodeURIComponent(String(barsLimit));

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      return Response.json({ error: "Binance fetch failed: " + r.status + " " + r.statusText }, { status: 502 });
    }

    const raw = await r.json();
    if (!Array.isArray(raw) || raw.length < 50) {
      return Response.json({ error: "Not enough data returned by Binance." }, { status: 502 });
    }

    const bars: Bar[] = raw.map((k: any[]) => ({
      t: toNumber(k[0]),
      o: toNumber(k[1]),
      h: toNumber(k[2]),
      l: toNumber(k[3]),
      c: toNumber(k[4])
    }));

    const closes = bars.map((b) => b.c);

    // --- only indicator supported in V1: RSI ---
    const entryRules = (definition.rules && definition.rules.entry && definition.rules.entry.all) || [];
    const exitRules = (definition.rules && definition.rules.exit && definition.rules.exit.any) || [];

    // Determine RSI length from first RSI rule (default 14)
    let rsiLen = 14;
    for (const rr of [...entryRules, ...exitRules]) {
      if (rr && rr.type === "indicator" && String(rr.name || "").toUpperCase() === "RSI") {
        rsiLen = Math.max(2, Math.min(100, toNumber(rr.length, 14)));
        break;
      }
    }

    const rsi = computeRSI(closes, rsiLen);

    function evalRule(rule: any, i: number): boolean {
      if (!rule || rule.type !== "indicator") return false;
      const name = String(rule.name || "").toUpperCase();
      if (name !== "RSI") return false;
      const v = rsi[i];
      if (v === null) return false;
      const op = String(rule.op || "<");
      const thr = toNumber(rule.value, 50);
      return cmp(v, op, thr);
    }

    function entryOK(i: number): boolean {
      if (!Array.isArray(entryRules) || entryRules.length === 0) return false;
      for (const rr of entryRules) {
        if (!evalRule(rr, i)) return false;
      }
      return true;
    }

    function exitOK(i: number): boolean {
      if (!Array.isArray(exitRules) || exitRules.length === 0) return false;
      for (const rr of exitRules) {
        if (evalRule(rr, i)) return true;
      }
      return false;
    }

    // Risk params (V1)
    const fixedQuoteAmount =
      definition.risk && definition.risk.positionSizing && definition.risk.positionSizing.type === "fixedQuote"
        ? toNumber(definition.risk.positionSizing.amount, 25)
        : 25;

    const slPercent =
      definition.risk && definition.risk.stopLoss && definition.risk.stopLoss.type === "percent"
        ? Math.max(0, toNumber(definition.risk.stopLoss.value, 0))
        : 0;

    const tpPercent =
      definition.risk && definition.risk.takeProfit && definition.risk.takeProfit.type === "percent"
        ? Math.max(0, toNumber(definition.risk.takeProfit.value, 0))
        : 0;

    const feeBps = definition.costs ? Math.max(0, toNumber(definition.costs.feeBps, 0)) : 0;
    const slippageBps = definition.costs ? Math.max(0, toNumber(definition.costs.slippageBps, 0)) : 0;

    const feeRate = feeBps / 10000;
    const slipRate = slippageBps / 10000;

    // --- backtest (long only, 1 position max) ---
    let cash = initialCapital;
    let qty = 0;
    let entryPrice = 0;
    let entryTime = 0;

    const equity: number[] = [];
    const equityT: number[] = [];

    const trades: any[] = [];

    const startIndex = Math.max(rsiLen + 2, 10);

    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];

      // mark-to-market
      const m2m = cash + qty * b.c;
      equity.push(m2m);
      equityT.push(b.t);

      if (i < startIndex) continue;

      if (qty <= 0) {
        // flat -> check entry at close
        if (entryOK(i)) {
          const spend = fixedQuoteAmount;
          if (spend > cash) continue;

          const px = b.c * (1 + slipRate);
          const q = spend / px;

          // fee on buy reduces cash
          const fee = spend * feeRate;
          cash = cash - spend - fee;

          qty = q;
          entryPrice = px;
          entryTime = b.t;
        }
      } else {
        // in position -> stop/tp using bar high/low
        const stopPx = slPercent > 0 ? entryPrice * (1 - slPercent / 100) : 0;
        const takePx = tpPercent > 0 ? entryPrice * (1 + tpPercent / 100) : 0;

        let exit = false;
        let exitPx = b.c * (1 - slipRate);
        let reason = "signal";

        // Conservative ordering: stop first, then take profit, then signal exit
        if (slPercent > 0 && b.l <= stopPx) {
          exit = true;
          exitPx = stopPx * (1 - slipRate);
          reason = "stop";
        } else if (tpPercent > 0 && b.h >= takePx) {
          exit = true;
          exitPx = takePx * (1 - slipRate);
          reason = "takeprofit";
        } else if (exitOK(i)) {
          exit = true;
          exitPx = b.c * (1 - slipRate);
          reason = "signal";
        }

        if (exit) {
          const proceeds = qty * exitPx;
          const fee = proceeds * feeRate;

          cash = cash + proceeds - fee;

          const pnl = (exitPx - entryPrice) * qty - (fixedQuoteAmount * feeRate) - (proceeds * feeRate);

          trades.push({
            entryTime,
            entryPrice,
            exitTime: b.t,
            exitPrice: exitPx,
            qty,
            pnl,
            reason
          });

          qty = 0;
          entryPrice = 0;
          entryTime = 0;
        }
      }
    }

    const finalEquity = equity.length ? equity[equity.length - 1] : initialCapital;
    const totalReturn = initialCapital > 0 ? (finalEquity - initialCapital) / initialCapital : 0;

    let wins = 0;
    let losses = 0;
    let grossWin = 0;
    let grossLoss = 0;

    for (const tr of trades) {
      if (tr.pnl >= 0) {
        wins += 1;
        grossWin += tr.pnl;
      } else {
        losses += 1;
        grossLoss += -tr.pnl;
      }
    }

    const winRate = trades.length ? wins / trades.length : 0;
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : null;
    const mdd = maxDrawdown(equity);

    return Response.json({
      symbol,
      timeframe: interval,
      initialCapital,
      finalEquity,
      totalReturn,
      maxDrawdown: mdd,
      tradesCount: trades.length,
      wins,
      losses,
      winRate,
      profitFactor,
      trades,
      equity: equity.map((v, idx) => ({ t: equityT[idx], v }))
    });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
