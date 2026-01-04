"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Row = {
  id: string;
  created_at: string;
  strategy_id: string | null;
  symbol: string;
  timeframe: string;
  action: string;
  price: number | null;
  reason: string | null;
};

export default function SignalsClient() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function load() {
    setErr(null);
    setLoading(true);

    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      window.location.href = "/login";
      return;
    }

    const { data: sigs, error } = await supabase
      .from("signals")
      .select("id,created_at,strategy_id,symbol,timeframe,action,price,reason")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((sigs as any) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      (r.symbol || "").toLowerCase().includes(s) ||
      (r.timeframe || "").toLowerCase().includes(s) ||
      (r.action || "").toLowerCase().includes(s) ||
      (r.reason || "").toLowerCase().includes(s) ||
      (r.strategy_id || "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Signals</h1>
          <div className="flex gap-2">
            <a className="rounded-md border px-4 py-2" href="/dashboard">Dashboard</a>
            <a className="rounded-md border px-4 py-2" href="/forward">Forward</a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            className="w-full md:w-96 rounded-md border px-3 py-2 text-sm"
            placeholder="********"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="rounded-md border px-4 py-2" onClick={load} type="button">
            Rafra?chir
          </button>
        </div>

        {loading && <div className="rounded-md border p-4">Chargement???</div>}
        {err && <div className="rounded-md border p-4 text-red-600 text-sm">{err}</div>}

        {!loading && !err && (
          <div className="rounded-md border overflow-hidden">
            <div className="grid grid-cols-6 gap-2 bg-gray-50 p-3 text-xs font-semibold">
              <div>Date</div>
              <div>Symbol</div>
              <div>TF</div>
              <div>Action</div>
              <div>Price</div>
              <div>Reason</div>
            </div>

            {filtered.length === 0 ? (
              <div className="p-4 text-sm text-gray-600">
                Aucun signal pour l??Tinstant (normal si rien n??Ta encore ?t? g?n?r?).
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((r) => (
                  <div key={r.id} className="grid grid-cols-6 gap-2 p-3 text-sm">
                    <div className="text-xs text-gray-600">
                      {new Date(r.created_at).toLocaleString()}
                    </div>
                    <div>{r.symbol}</div>
                    <div>{r.timeframe}</div>
                    <div className="font-semibold">{r.action}</div>
                    <div>{r.price ?? "-"}</div>
                    <div className="text-xs text-gray-600">{r.reason ?? "-"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
