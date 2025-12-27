"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Plan = "free" | "pro" | "elite";

export default function PricingPage() {
  const [plan, setPlan] = useState<Plan>("free");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadPlan() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setPlan("free"); return; }

    const { data: prof } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", data.session.user.id)
      .maybeSingle();

    setPlan((prof?.plan || "free") as Plan);
  }

  async function subscribe(target: "pro" | "elite") {
    setErr(null);
    setBusy(true);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setErr("Tu dois être connecté."); setBusy(false); return; }

    const r = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ plan: target })
    });

    const j = await r.json();
    setBusy(false);

    if (!r.ok) { setErr(j?.error || "Checkout failed"); return; }
    if (j?.url) window.location.href = j.url;
  }

  useEffect(() => { loadPlan(); }, []);

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Pricing</h1>
            <p className="text-sm text-gray-600">
              Plan actuel: <b>{plan.toUpperCase()}</b>
            </p>
          </div>
          <a href="/dashboard" className="rounded-md border px-4 py-2">Retour</a>
        </div>

        {err && <div className="rounded-md border p-3 text-sm text-red-600">{err}</div>}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-md border p-4 space-y-3">
            <h2 className="text-xl font-semibold">Free</h2>
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
              <li>Builder + Save</li>
              <li>Backtest basique</li>
              <li>Export basique</li>
            </ul>
            <div className="text-sm text-gray-600">0 CHF / mois</div>
          </div>

          <div className="rounded-md border p-4 space-y-3">
            <h2 className="text-xl font-semibold">Pro</h2>
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
              <li>Forward testing (cron)</li>
              <li>Plus de backtests</li>
              <li>Export amélioré</li>
            </ul>
            <button
              disabled={busy}
              className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
              onClick={() => subscribe("pro")}
              type="button"
            >
              Passer à Pro
            </button>
          </div>

          <div className="rounded-md border p-4 space-y-3">
            <h2 className="text-xl font-semibold">Elite</h2>
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
              <li>IA + signaux avancés (bientôt)</li>
              <li>Multi-assets / portfolio (bientôt)</li>
              <li>Priorité support</li>
            </ul>
            <button
              disabled={busy}
              className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
              onClick={() => subscribe("elite")}
              type="button"
            >
              Passer à Elite
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
