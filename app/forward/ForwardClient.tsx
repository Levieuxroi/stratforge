"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Status = {
  ok: boolean;
  plan: "free" | "pro" | "elite";
  forward: {
    enabled: boolean;
    schedule: string;
    interval_minutes: number;
    strategy_id: string | null;
    last_run_at: string | null;
    last_error: string | null;
    updated_at: string | null;
  };
  error?: string;
};

type StrategyRow = { id: string; name: string; symbol: string; timeframe: string };

export default function ForwardClient() {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<"free" | "pro" | "elite">("free");
  const [enabled, setEnabled] = useState(false);
  const [schedule, setSchedule] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState<number>(5);
  const [strategyId, setStrategyId] = useState<string>("");
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function loadStrategies() {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return;

    const { data: list, error } = await supabase
      .from("strategies")
      .select("id,name,symbol,timeframe")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error && list) {
      setStrategies(list as any);
    }
  }

  async function callStatus() {
    setErr(null);
    setMsg(null);
    setLoading(true);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { window.location.href = "/login"; return; }

    const r = await fetch("/api/forward/status", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` }
    });

    const j = (await r.json()) as Status;

    if (!r.ok) {
      setErr(j?.error || "Status failed");
      setLoading(false);
      return;
    }

    setPlan(j.plan);
    setEnabled(!!j.forward?.enabled);
    setSchedule(j.forward?.schedule || "");
    setIntervalMinutes(Number(j.forward?.interval_minutes || 5));
    setStrategyId(j.forward?.strategy_id || "");
    setLastRunAt(j.forward?.last_run_at || null);
    setLastError(j.forward?.last_error || null);

    setLoading(false);
  }

  async function save(nextEnabled: boolean) {
    setErr(null);
    setMsg(null);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { window.location.href = "/login"; return; }

    const r = await fetch("/api/forward/toggle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        enable: nextEnabled,
        schedule,
        interval_minutes: intervalMinutes,
        strategy_id: strategyId || null
      })
    });

    const j = await r.json();
    if (!r.ok) {
      setErr(j?.error || "Save failed");
      return;
    }

    setEnabled(!!j.enabled);
    setMsg(nextEnabled ? "Forward testing activé." : "Forward testing désactivé.");
  }

  useEffect(() => {
    loadStrategies();
    callStatus();
  }, []);

  const canUse = plan === "pro" || plan === "elite";
  const selected = useMemo(() => strategies.find(s => s.id === strategyId) || null, [strategies, strategyId]);

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Forward testing</h1>
          <div className="flex gap-2">
            <a className="rounded-md border px-4 py-2" href="/dashboard">Dashboard</a>
            <a className="rounded-md border px-4 py-2" href="/pricing">Upgrade</a>
          </div>
        </div>

        <div className="rounded-md border p-4">
          <div className="text-sm text-gray-600">Plan</div>
          <div className="text-lg font-semibold">{plan.toUpperCase()}</div>
          {lastRunAt && (
            <div className="mt-2 text-xs text-gray-600">
              Dernier run: {new Date(lastRunAt).toLocaleString()}
            </div>
          )}
          {lastError && (
            <div className="mt-2 text-xs text-red-600">
              Dernière erreur: {lastError}
            </div>
          )}
        </div>

        {loading && <div className="rounded-md border p-4">Chargement…</div>}
        {err && <div className="rounded-md border p-4 text-red-600 text-sm">{err}</div>}
        {msg && <div className="rounded-md border p-4 text-green-700 text-sm">{msg}</div>}

        {!loading && (
          <div className="rounded-md border p-4 space-y-3">
            <div className="text-sm text-gray-600">
              Le cron Vercel appelle /api/cron. Ici tu choisis la stratégie et l'intervalle souhaité.
            </div>

            <label className="block text-sm">
              Stratégie à exécuter
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={strategyId}
                onChange={(e) => setStrategyId(e.target.value)}
                disabled={!canUse}
              >
                <option value="">(Choisir une stratégie…)</option>
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.symbol} — {s.timeframe}
                  </option>
                ))}
              </select>
            </label>

            {selected && (
              <div className="text-xs text-gray-600">
                Sélection: <b>{selected.name}</b> ({selected.symbol}, {selected.timeframe})
              </div>
            )}

            <label className="block text-sm">
              Interval (minutes)
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                type="number"
                min={1}
                max={1440}
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                disabled={!canUse}
              />
            </label>

            <label className="block text-sm">
              Schedule (optionnel, stocké en DB)
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder='ex: */5 * * * *'
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                disabled={!canUse}
              />
            </label>

            {!canUse && (
              <div className="text-sm text-red-600">
                Upgrade requis (Pro/Elite) pour activer le forward testing.
              </div>
            )}

            <div className="flex gap-2">
              <button
                className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
                onClick={() => save(true)}
                disabled={!canUse || enabled || !strategyId}
                type="button"
              >
                Activer
              </button>

              <button
                className="rounded-md border px-4 py-2 disabled:opacity-50"
                onClick={() => save(false)}
                disabled={!canUse || !enabled}
                type="button"
              >
                Désactiver
              </button>

              <button
                className="rounded-md border px-4 py-2"
                onClick={() => { loadStrategies(); callStatus(); }}
                type="button"
              >
                Rafraîchir
              </button>

              <a className="rounded-md border px-4 py-2" href="/signals">
                Voir signaux
              </a>
            </div>

            {!strategyId && (
              <div className="text-xs text-gray-600">
                Note: tu dois sélectionner une stratégie pour activer.
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
