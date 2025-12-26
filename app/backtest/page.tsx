"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type StrategyRow = {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  definition: any;
};

type BacktestResult = {
  symbol: string;
  timeframe: string;
  initialCapital: number;
  finalEquity: number;
  totalReturn: number;
  maxDrawdown: number;
  tradesCount: number;
  winRate: number;
  profitFactor: number | null;
  equity: { t: number; v: number }[];
};

function fmtPct(x: number) {
  return (x * 100).toFixed(2) + "%";
}

export default function BacktestPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const id = useMemo(() => sp.get("id"), [sp]);

  const [strat, setStrat] = useState<StrategyRow | null>(null);
  const [res, setRes] = useState<BacktestResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setErr(null);
    setRes(null);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      router.push("/login");
      return;
    }

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

    const row = data as StrategyRow;
    setStrat(row);

    const r = await fetch("/api/backtest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: row.symbol,
        timeframe: row.timeframe,
        definition: row.definition,
        initialCapital: 1000,
        barsLimit: 1000
      })
    });

    const j = await r.json();
    if (!r.ok) {
      setErr(j?.error || "Backtest error");
      setBusy(false);
      return;
    }

    setRes(j as BacktestResult);
    setBusy(false);
  }

  // mini chart SVG
  function EquityChart() {
    if (!res || !res.equity || res.equity.length < 2) return null;

    const w = 900;
    const h = 220;
    const pad = 10;

    const xs = res.equity.map((p) => p.t);
    const ys = res.equity.map((p) => p.v);

    const minX = Math.min.apply(null, xs);
    const maxX = Math.max.apply(null, xs);
    const minY = Math.min.apply(null, ys);
    const maxY = Math.max.apply(null, ys);

    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;

    const pts = res.equity
      .map((p) => {
        const x = pad + ((p.t - minX) / spanX) * (w - 2 * pad);
        const y = h - pad - ((p.v - minY) / spanY) * (h - 2 * pad);
        return x.toFixed(1) + "," + y.toFixed(1);
      })
      .join(" ");

    return (
      <div className="rounded-md border p-3">
        <div className="text-sm font-semibold mb-2">Equity curve</div>
        <svg width="100%" viewBox={"0 0 " + w + " " + h} className="block">
          <polyline fill="none" stroke="currentColor" strokeWidth="2" points={pts} />
        </svg>
        <div className="text-xs text-gray-600 mt-2">
          Min: {minY.toFixed(2)} • Max: {maxY.toFixed(2)}
        </div>
      </div>
    );
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Backtest</h1>
            <div className="text-sm text-gray-600">{strat ? strat.name : ""}</div>
          </div>
          <div className="flex gap-2">
            <button className="rounded-md border px-4 py-2" onClick={load} disabled={busy}>
              {busy ? "..." : "Relancer"}
            </button>
            <a className="rounded-md border px-4 py-2" href="/dashboard">
              Retour
            </a>
          </div>
        </div>

        {err && <div className="rounded-md border p-3 text-sm text-red-600">Erreur: {err}</div>}

        {busy ? (
          <div className="text-sm text-gray-600">Calcul...</div>
        ) : res ? (
          <div className="space-y-4">
            <div className="rounded-md border p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-sm">
                <div><b>Symbol</b><div>{res.symbol}</div></div>
                <div><b>Timeframe</b><div>{res.timeframe}</div></div>
                <div><b>Trades</b><div>{res.tradesCount}</div></div>

                <div><b>Total return</b><div>{fmtPct(res.totalReturn)}</div></div>
                <div><b>Max drawdown</b><div>{fmtPct(res.maxDrawdown)}</div></div>
                <div><b>Win rate</b><div>{fmtPct(res.winRate)}</div></div>

                <div><b>Initial equity</b><div>{res.initialCapital.toFixed(2)}</div></div>
                <div><b>Final equity</b><div>{res.finalEquity.toFixed(2)}</div></div>
                <div><b>Profit factor</b><div>{res.profitFactor === null ? "n/a" : res.profitFactor.toFixed(2)}</div></div>
              </div>
            </div>

            <EquityChart />
          </div>
        ) : null}
      </div>
    </main>
  );
}
