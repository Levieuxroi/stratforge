"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type StrategyRow = {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  definition: any;
};

type Bar = { t: number; o: number; h: number; l: number; c: number };

type SignalRow = {
  id: string;
  t: string;
  signal_type: "ENTRY" | "EXIT";
  price: number | null;
  meta: any;
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

export default function ForwardClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const id = useMemo(() => sp.get("id"), [sp]);

  const [strat, setStrat] = useState<StrategyRow | null>(null);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>("");

  const [enabled, setEnabled] = useState(false);
  const [freq, setFreq] = useState(300);

  const timerRef = useRef<any>(null);
  const lastSignalRef = useRef<string>("");

  async function requireSession() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.push("/login");
      return null;
    }
    return data.session;
  }

  async function loadStrategy() {
    setBusy(true);
    setErr(null);

    const session = await requireSession();
    if (!session) return;

    if (!id) {
      setErr("Missing id");
      setBusy(false);
      return;
    }

    const { data, error } = await supabase
      .from("strategies")
      .select("id,name,symbol,timeframe,definition")
      .eq("id", id)
      .single();

    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }

    setStrat(data as StrategyRow);
    setBusy(false);
  }

  async function loadSignals() {
    const session = await requireSession();
    if (!session || !id) return;

    const { data, error } = await supabase
      .from("signals")
      .select("id,t,signal_type,price,meta")
      .eq("strategy_id", id)
      .order("t", { ascending: false })
      .limit(50);

    if (!error) setSignals((data ?? []) as any);
  }

  async function loadForwardConfig() {
    const session = await requireSession();
    if (!session || !id) return;

    const { data, error } = await supabase
      .from("forward_configs")
      .select("is_enabled,frequency_seconds")
      .eq("strategy_id", id)
      .limit(1);

    if (!error && data && data.length) {
      setEnabled(!!data[0].is_enabled);
      setFreq(Number(data[0].frequency_seconds || 300));
    } else {
      setEnabled(false);
      setFreq(300);
    }
  }

  async function setForwardConfig(isEnabled: boolean) {
    setErr(null);
    const session = await requireSession();
    if (!session || !strat) return;

    const up = await supabase.from("forward_configs").upsert(
      {
        user_id: session.user.id,
        strategy_id: strat.id,
        is_enabled: isEnabled,
        frequency_seconds: freq,
        updated_at: new Date().toISOString()
      },
      { onConflict: "strategy_id" }
    );

    if (up.error) {
      setErr(up.error.message);
      return;
    }

    setEnabled(isEnabled);
  }

  async function tickOnceLocal() {
    if (!strat) return;

    const r = await fetch("/api/market/bars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: strat.symbol, timeframe: strat.timeframe, limit: 300 })
    });

    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "Market fetch failed");

    setProvider(String(j.provider || ""));

    const bars: Bar[] = (j.bars || []) as Bar[];
    if (bars.length < 50) throw new Error("Not enough bars");

    const closes = bars.map((b) => b.c);

    const { len, entryOp, entryVal, exitOp, exitVal } = getRSIRules(strat.definition);
    const rsi = computeRSI(closes, len);

    const lastIdx = bars.length - 1;
    const lastBar = bars[lastIdx];
    const lastRSI = rsi[lastIdx];
    if (lastRSI === null) return;

    const { data: lastSig } = await supabase
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

    if (!newSignal) return;

    const key = strat.id + "|" + String(lastBar.t) + "|" + newSignal;
    if (lastSignalRef.current === key) return;
    lastSignalRef.current = key;

    const session = await requireSession();
    if (!session) return;

    const ins = await supabase.from("signals").insert({
      user_id: session.user.id,
      strategy_id: strat.id,
      t: new Date(lastBar.t).toISOString(),
      signal_type: newSignal,
      price: lastBar.c,
      meta: { provider: String(j.provider || ""), rsi: lastRSI, timeframe: strat.timeframe, mode: "local" }
    });

    if (ins.error) {
      const msg = String(ins.error.message || "").toLowerCase();
      if (!msg.includes("duplicate")) throw new Error(ins.error.message);
    }

    await loadSignals();
  }

  function startLocalLoop() {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      tickOnceLocal().catch((e) => setErr(String(e?.message || e)));
    }, 60000);
  }

  function stopLocalLoop() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    loadStrategy();
    loadSignals();
    loadForwardConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    return () => stopLocalLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Forward testing (V1)</h1>
            <div className="text-sm text-gray-600">{strat ? strat.name : ""}</div>
            {provider ? <div className="text-xs text-gray-600">Data provider (local fetch): {provider}</div> : null}
            <div className="text-xs text-gray-600">Server forward: {enabled ? "ON ✅" : "OFF"}</div>
          </div>

          <div className="flex gap-2">
            {enabled ? (
              <button className="rounded-md border px-4 py-2" onClick={() => setForwardConfig(false)}>
                Stop server
              </button>
            ) : (
              <button className="rounded-md bg-black px-4 py-2 text-white" onClick={() => setForwardConfig(true)}>
                Start server
              </button>
            )}

            <button className="rounded-md border px-4 py-2" onClick={() => tickOnceLocal().catch((e) => setErr(String(e?.message || e)))}>
              Run now
            </button>

            <button className="rounded-md border px-4 py-2" onClick={loadSignals}>
              Refresh
            </button>

            <a className="rounded-md border px-4 py-2" href="/dashboard">
              Retour
            </a>
          </div>
        </div>

        {err && <div className="rounded-md border p-3 text-sm text-red-600">Erreur: {err}</div>}

        <div className="rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-gray-700">
              Fréquence server (sec)
              <div className="text-xs text-gray-600">Recommandé: 300 (5 min)</div>
            </div>
            <input
              className="w-28 rounded-md border px-3 py-2"
              type="number"
              value={freq}
              min={60}
              max={3600}
              onChange={(e) => setFreq(Number(e.target.value))}
            />
          </div>
          <div className="text-xs text-gray-600 mt-2">
            Après modification de fréquence, clique Start server (ou Stop/Start) pour enregistrer.
          </div>
        </div>

        <div className="rounded-md border">
          <div className="border-b p-3 text-sm font-semibold">Derniers signaux (max 50)</div>
          {signals.length === 0 ? (
            <div className="p-3 text-sm text-gray-600">Aucun signal enregistré.</div>
          ) : (
            <div className="divide-y">
              {signals.map((s) => (
                <div key={s.id} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{s.signal_type}</div>
                    <div className="text-sm text-gray-600">{new Date(s.t).toLocaleString()}</div>
                  </div>
                  <div className="text-sm">{s.price !== null ? Number(s.price).toFixed(2) : ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-xs text-gray-600">
          “Run now” force un check immédiat (utile pour voir si ta stratégie déclenche quelque chose).
          Le “Start server” permet à Vercel Cron de faire tourner ça même navigateur fermé.
        </div>
      </div>
    </main>
  );
}
