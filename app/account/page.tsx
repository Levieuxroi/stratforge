"use client";


import { requireAuth, requirePlan } from "../../lib/pageGuard";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Plan = "free" | "pro" | "elite";

export default function AccountPage() {
  const [plan, setPlan] = useState<Plan>("free");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (!data.session) {
        window.location.href = "/login?next=" + encodeURIComponent("/account");
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", data.session.user.id)
        .maybeSingle();

      if (profErr) throw profErr;

      setPlan((prof?.plan || "free") as Plan);
    } catch (e: any) {
      setErr(e?.message ?? "Erreur inconnue");
    }
  }

  async function openPortal() {
    setErr(null);
    setBusy(true);

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const token = data.session?.access_token;
      if (!token) {
        window.location.href = "/login?next=" + encodeURIComponent("/account");
        return;
      }

      const r = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const j = await r.json();

      if (!r.ok) {
        setErr(j?.error || "Portal failed");
        return;
      }

      if (j?.url) window.location.href = j.url;
    } catch (e: any) {
      setErr(e?.message ?? "Portal failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Compte</h1>
          <a href="/dashboard" className="rounded-md border px-4 py-2">
            Dashboard
          </a>
        </div>

        {err && <div className="rounded-md border p-3 text-sm text-red-600">{err}</div>}

        <div className="rounded-md border p-4">
          <div className="text-sm text-gray-600">Plan actuel</div>
          <div className="text-xl font-semibold">{plan.toUpperCase()}</div>

          <div className="mt-3 flex gap-2">
            <a className="rounded-md border px-4 py-2" href="/pricing">
              Voir pricing
            </a>
            <button
              className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
              disabled={busy}
              onClick={openPortal}
              type="button"
            >
              Gérer mon abonnement
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
