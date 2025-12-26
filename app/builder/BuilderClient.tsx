"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const templateDefinition = {
  name: "RSI Reversal V1",
  rules: {
    entry: { all: [{ type: "indicator", name: "RSI", length: 14, source: "close", op: "<", value: 30 }] },
    exit: { any: [{ type: "indicator", name: "RSI", length: 14, source: "close", op: ">", value: 70 }] }
  },
  risk: {
    positionSizing: { type: "fixedQuote", amount: 25 },
    stopLoss: { type: "percent", value: 2.0 },
    takeProfit: { type: "percent", value: 4.0 }
  },
  costs: { feeBps: 10, slippageBps: 5 }
};

type StrategyRow = {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  definition: any;
};

export default function BuilderClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const id = useMemo(() => sp.get("id"), [sp]);

  const [name, setName] = useState("RSI Reversal V1");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("1h");
  const [jsonText, setJsonText] = useState(JSON.stringify(templateDefinition, null, 2));

  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function requireSession() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.push("/login");
      return null;
    }
    return data.session;
  }

  async function loadIfEdit() {
    setBusy(true);
    setErr(null);
    setMsg(null);

    const session = await requireSession();
    if (!session) return;

    if (!id) {
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
    setName(row.name);
    setSymbol(row.symbol);
    setTimeframe(row.timeframe);
    setJsonText(JSON.stringify(row.definition, null, 2));
    setBusy(false);
  }

  async function save() {
    setErr(null);
    setMsg(null);

    const session = await requireSession();
    if (!session) return;

    let def: any;
    try {
      def = JSON.parse(jsonText);
    } catch {
      setErr("JSON invalide: vérifie la syntaxe (virgules, guillemets, etc.).");
      return;
    }

    if (def && typeof def === "object") def.name = name;

    setBusy(true);

    if (id) {
      const { error } = await supabase
        .from("strategies")
        .update({ name, symbol, timeframe, definition: def, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) setErr(error.message);
      else setMsg("Stratégie mise à jour ✅");
      setBusy(false);
      return;
    }

    const { error } = await supabase.from("strategies").insert({
      user_id: session.user.id,
      name,
      symbol,
      timeframe,
      definition: def
    });

    if (error) setErr(error.message);
    else {
      setMsg("Stratégie sauvegardée ✅");
      router.push("/dashboard");
    }

    setBusy(false);
  }

  useEffect(() => {
    loadIfEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Strategy Builder (V1)</h1>
            <div className="text-sm text-gray-600">{id ? "Édition" : "Nouvelle stratégie"}</div>
          </div>
          <div className="flex gap-2">
            <button disabled={busy} className="rounded-md bg-black px-4 py-2 text-white" onClick={save}>
              {busy ? "..." : "Save"}
            </button>
            <a className="rounded-md border px-4 py-2" href="/dashboard">
              Retour
            </a>
          </div>
        </div>

        {err && <div className="rounded-md border p-3 text-sm text-red-600">Erreur: {err}</div>}
        {msg && <div className="rounded-md border p-3 text-sm text-green-700">{msg}</div>}

        {busy ? (
          <div className="text-sm text-gray-600">Chargement...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <label className="block text-sm">Nom</label>
                <input className="w-full rounded-md border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm">Symbol</label>
                <input className="w-full rounded-md border px-3 py-2" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm">Timeframe</label>
                <input className="w-full rounded-md border px-3 py-2" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm">Definition (JSON)</label>
              <textarea
                className="w-full rounded-md border px-3 py-2 font-mono text-sm"
                rows={18}
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
              />
              <div className="text-xs text-gray-600">
                V1: on sauvegarde un JSON. Prochaine étape: éditeur “blocs” qui génère ce JSON automatiquement.
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
