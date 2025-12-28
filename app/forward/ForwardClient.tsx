"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Status = {
  ok: boolean;
  plan: "free" | "pro" | "elite";
  forward: { enabled: boolean; schedule: string; updated_at: string | null };
  error?: string;
};

export default function ForwardClient() {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<"free" | "pro" | "elite">("free");
  const [enabled, setEnabled] = useState(false);
  const [schedule, setSchedule] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function callStatus() {
    setErr(null);
    setMsg(null);
    setLoading(true);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      window.location.href = "/login";
      return;
    }

    const r = await fetch("/api/forward/status", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });

    const j = (await r.json()) as Status;

    if (!r.ok) {
      setErr((j as any)?.error || "Status failed");
      setLoading(false);
      return;
    }

    setPlan(j.plan);
    setEnabled(!!j.forward?.enabled);
    setSchedule(j.forward?.schedule || "");
    setLoading(false);
  }

  async function toggle(next: boolean) {
    setErr(null);
    setMsg(null);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      window.location.href = "/login";
      return;
    }

    const r = await fetch("/api/forward/toggle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ enable: next, schedule })
    });

    const j = await r.json();

    if (!r.ok) {
      setErr((j as any)?.error || "Toggle failed");
      return;
    }

    setEnabled(!!(j as any).enabled);
    setMsg(next ? "Forward testing activé." : "Forward testing désactivé.");
  }

  useEffect(() => {
    callStatus();
  }, []);

  const canUse = plan === "pro" || plan === "elite";

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
        </div>

        {loading && <div className="rounded-md border p-4">Chargement…</div>}
        {err && <div className="rounded-md border p-4 text-red-600 text-sm">{err}</div>}
        {msg && <div className="rounded-md border p-4 text-green-700 text-sm">{msg}</div>}

        {!loading && (
          <div className="rounded-md border p-4 space-y-3">
            <div className="text-sm text-gray-600">
              Active/désactive le forward testing. (Ton cron Vercel appelle /api/cron selon ton vercel.json.)
            </div>

            <label className="block text-sm">
              Schedule (optionnel)
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
                onClick={() => toggle(true)}
                disabled={!canUse || enabled}
                type="button"
              >
                Activer
              </button>

              <button
                className="rounded-md border px-4 py-2 disabled:opacity-50"
                onClick={() => toggle(false)}
                disabled={!canUse || !enabled}
                type="button"
              >
                Désactiver
              </button>

              <button
                className="rounded-md border px-4 py-2"
                onClick={callStatus}
                type="button"
              >
                Rafraîchir
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
