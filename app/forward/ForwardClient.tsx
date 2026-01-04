"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase/browser";

type Strategy = {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
};

type Status = {
  enabled: boolean;
  schedule: string | null;
  intervalMinutes: number | null;
  lastRunAt: string | null;
  lastError: string | null;
  strategyId: string | null;
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

export default function ForwardClient() {
  const supabase = useMemo(() => supabaseBrowser, []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [schedule, setSchedule] = useState<string>("cron");
  const [intervalMinutes, setIntervalMinutes] = useState<number>(15);
  const [strategyId, setStrategyId] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);

  async function loadStrategies() {
    const { data, error } = await supabase
      .from("strategies")
      .select("id,name,symbol,timeframe")
      .order("created_at", { ascending: false });

    if (error) throw error;
    setStrategies((data || []) as any);
  }

  async function loadStatus() {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;

    const r = await fetch("/api/forward/status", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({})
    });

    const j = await safeReadJson(r);

    if (!r.ok) {
      const errMsg = (j && (j.error || j.message)) ? (j.error || j.message) : `HTTP ${r.status}`;
      throw new Error(errMsg);
    }

    const s = (j?.status || j) as Status;

    setStatus(s);
    setEnabled(!!s.enabled);
    setSchedule((s.schedule || "cron") as any);
    setIntervalMinutes(s.intervalMinutes ?? 15);
    setStrategyId(s.strategyId || "");
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const r = await fetch("/api/forward/toggle", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          enabled,
          schedule,
          intervalMinutes,
          strategyId: strategyId || null
        })
      });

      const j = await safeReadJson(r);

      if (!r.ok) {
        const errMsg = (j && (j.error || j.message)) ? (j.error || j.message) : `HTTP ${r.status}`;
        throw new Error(errMsg);
      }

      setMsg("Enregistr\u00E9 OK");
await loadStatus();
    } catch (e: any) {
      setMsg("Erreur: " + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg(null);
      try {
        await loadStrategies();
        await loadStatus();
      } catch (e: any) {
        setMsg("Erreur: " + (e?.message || String(e)));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="p-6">Chargement?f?'?f?,?s</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Forward</h1>
        {msg ? <div className="text-sm opacity-80">{msg}</div> : null}
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={saving}
          />
          <span>Activer Forward</span>
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-sm mb-1">Mode</div>
            <select
              className="border rounded-md px-3 py-2 w-full"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              disabled={saving}
            >
              <option value="cron">Cron</option>
              <option value="interval">Interval</option>
            </select>
          </div>

          <div>
            <div className="text-sm mb-1">Interval (minutes)</div>
            <input
              className="border rounded-md px-3 py-2 w-full"
              type="number"
              min={1}
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Number(e.target.value || 0))}
              disabled={saving || schedule !== "interval"}
            />
          </div>
        </div>

        <div>
          <div className="text-sm mb-1">Strat?f?'????Tgie</div>
          <select
            className="border rounded-md px-3 py-2 w-full"
            value={strategyId}
            onChange={(e) => setStrategyId(e.target.value)}
            disabled={saving}
          >
            <option value="">?f?'?f?,?s?f??s s?f?'????Tlectionner ?f?'?f?,?s?f??s</option>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.symbol} / {s.timeframe})
              </option>
            ))}
          </select>
        </div>

        <button
          className="rounded-md bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Sauvegarde..." : "Sauvegarder"}
        </button>

        {status ? (
          <div className="text-xs opacity-80 pt-2">
            <div>Dernier run: {status.lastRunAt || "-"}</div>
            <div>Derni?f?'????Tre erreur: {status.lastError || "-"}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}