"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase/browser";

type Strategy = {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
};

async function safeReadJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export default function BacktestClient() {
  const supabase = useMemo(() => supabaseBrowser, []);
  const [loading, setLoading] = useState(true);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [strategyId, setStrategyId] = useState("");
  const [from, setFrom] = useState("2024-01-01");
  const [to, setTo] = useState("2025-01-01");
  const [running, setRunning] = useState(false);
  const [out, setOut] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function loadStrategies() {
    const { data, error } = await supabase
      .from("strategies")
      .select("id,name,symbol,timeframe")
      .order("created_at", { ascending: false });

    if (error) throw error;
    setStrategies((data || []) as any);
    if (!strategyId && data && data[0]) setStrategyId((data[0] as any).id);
  }

  async function run() {
    setRunning(true);
    setMsg(null);
    setOut(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const r = await fetch("/api/backtest", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ strategyId, from, to })
      });

      const j = await safeReadJson(r);

      if (!r.ok) {
        const errMsg = (j && (j.error || j.message)) ? (j.error || j.message) : `HTTP ${r.status}`;
        throw new Error(errMsg);
      }

      setOut(j);
    } catch (e: any) {
      setMsg("Erreur: " + (e?.message || String(e)));
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg(null);
      try {
        await loadStrategies();
      } catch (e: any) {
        setMsg("Erreur: " + (e?.message || String(e)));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="p-6">Chargement???</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Backtest</h1>
        {msg ? <div className="text-sm opacity-80">{msg}</div> : null}
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div>
          <div className="text-sm mb-1">Strat??gie</div>
          <select
            className="border rounded-md px-3 py-2 w-full"
            value={strategyId}
            onChange={(e) => setStrategyId(e.target.value)}
            disabled={running}
          >
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.symbol} / {s.timeframe})
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-sm mb-1">De</div>
            <input
              className="border rounded-md px-3 py-2 w-full"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              disabled={running}
            />
          </div>
          <div>
            <div className="text-sm mb-1">?f?,?</div>
            <input
              className="border rounded-md px-3 py-2 w-full"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={running}
            />
          </div>
        </div>

        <button
          className="rounded-md bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
          onClick={run}
          disabled={running || !strategyId}
        >
          {running ? "Calcul..." : "Lancer"}
        </button>
      </div>

      {out ? (
        <pre className="text-xs bg-gray-50 border rounded-lg p-4 overflow-auto">
          {JSON.stringify(out, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}