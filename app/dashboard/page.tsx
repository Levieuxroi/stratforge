"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type StrategyRow = {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  created_at: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [rows, setRows] = useState<StrategyRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setErr(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      router.push("/login");
      return;
    }

    setEmail(session.user.email ?? "");

    const { data, error } = await supabase
      .from("strategies")
      .select("id,name,symbol,timeframe,created_at")
      .order("created_at", { ascending: false });

    if (error) setErr(error.message);
    setRows((data ?? []) as StrategyRow[]);
    setBusy(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <div className="text-sm text-gray-600">Connecté: {email || "..."}</div>
          </div>
          <div className="flex gap-2 pointer-events-auto">
            <button
              type="button"
              className="rounded-md bg-black px-4 py-2 text-white cursor-pointer pointer-events-auto"
              onClick={() => router.push("/builder")}
            >
              + Nouvelle stratégie
            </button>
            <button
              type="button"
              className="rounded-md border px-4 py-2 cursor-pointer pointer-events-auto"
              onClick={logout}
            >
              Déconnexion
            </button>
          </div>
        </div>

        <div className="rounded-md border">
          <div className="border-b p-3 text-sm font-semibold">Mes stratégies</div>

          {busy ? (
            <div className="p-3 text-sm text-gray-600">Chargement...</div>
          ) : err ? (
            <div className="p-3 text-sm text-red-600">Erreur: {err}</div>
          ) : rows.length === 0 ? (
            <div className="p-3 text-sm text-gray-600">Aucune stratégie. Crée ta première stratégie.</div>
          ) : (
            <div className="divide-y">
              {rows.map((s) => (
                <div key={s.id} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-sm text-gray-600">
                      {s.symbol} • {s.timeframe}
                    </div>
                  </div>

                  <div className="flex gap-2 pointer-events-auto">
                    <button
                      type="button"
                      className="rounded-md border px-3 py-2 text-sm cursor-pointer pointer-events-auto"
                      onClick={() => router.push("/backtest?id=" + s.id)}
                    >
                      Backtest
                    </button>
                    <button
                      type="button"
                      className="rounded-md border px-3 py-2 text-sm cursor-pointer pointer-events-auto"
                      onClick={() => router.push("/export?id=" + s.id)}
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      className="rounded-md border px-3 py-2 text-sm cursor-pointer pointer-events-auto"
                      onClick={() => router.push("/builder?id=" + s.id)}
                    >
                      Éditer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <a className="text-sm underline" href="/">
          ← Retour
        </a>
      </div>
    </main>
  );
}
