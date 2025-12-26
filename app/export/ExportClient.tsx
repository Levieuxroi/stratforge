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

function getRSIParams(def: any) {
  const entry = def?.rules?.entry?.all || [];
  const exit = def?.rules?.exit?.any || [];

  let len = 14;
  let entryOp = "<";
  let entryVal = 30;
  let exitOp = ">";
  let exitVal = 70;

  for (const r of entry) {
    if (r?.type === "indicator" && String(r?.name || "").toUpperCase() === "RSI") {
      len = Number(r.length ?? len);
      entryOp = String(r.op ?? entryOp);
      entryVal = Number(r.value ?? entryVal);
      break;
    }
  }
  for (const r of exit) {
    if (r?.type === "indicator" && String(r?.name || "").toUpperCase() === "RSI") {
      len = Number(r.length ?? len);
      exitOp = String(r.op ?? exitOp);
      exitVal = Number(r.value ?? exitVal);
      break;
    }
  }

  if (!Number.isFinite(len) || len < 2) len = 14;
  if (!Number.isFinite(entryVal)) entryVal = 30;
  if (!Number.isFinite(exitVal)) exitVal = 70;

  return { len, entryOp, entryVal, exitOp, exitVal };
}

function pineComparator(op: string) {
  const o = op.trim();
  if (o === "<" || o === "<=" || o === ">" || o === ">=") return o;
  return "<";
}

function qcComparator(op: string) {
  const o = op.trim();
  if (o === "<" || o === "<=" || o === ">" || o === ">=") return o;
  return "<";
}

function buildPine(strat: StrategyRow) {
  const { len, entryOp, entryVal, exitOp, exitVal } = getRSIParams(strat.definition);
  const eop = pineComparator(entryOp);
  const xop = pineComparator(exitOp);

  const title = (strat.name || "StratForge Export").replaceAll('"', "");

  return [
    "//@version=5",
    'strategy("' + title + '", overlay=true, initial_capital=1000)',
    "",
    "rsiLen = input.int(" + len + ', "RSI Length", minval=2)',
    "entryLevel = input.float(" + entryVal + ', "Entry Level")',
    "exitLevel = input.float(" + exitVal + ', "Exit Level")',
    "",
    "r = ta.rsi(close, rsiLen)",
    "longCond = r " + eop + " entryLevel",
    "exitCond = r " + xop + " exitLevel",
    "",
    "if (longCond)",
    '    strategy.entry("L", strategy.long)',
    "",
    "if (exitCond)",
    '    strategy.close("L")',
    ""
  ].join("\n");
}

function buildQuantConnectPython(strat: StrategyRow) {
  const { len, entryOp, entryVal, exitOp, exitVal } = getRSIParams(strat.definition);
  const eop = qcComparator(entryOp);
  const xop = qcComparator(exitOp);

  const tf = (strat.timeframe || "1h").trim();
  const resMap: Record<string, string> = {
    "1m": "Resolution.Minute",
    "5m": "Resolution.Minute",
    "15m": "Resolution.Minute",
    "30m": "Resolution.Minute",
    "1h": "Resolution.Hour",
    "4h": "Resolution.Hour",
    "1d": "Resolution.Daily"
  };
  const res = resMap[tf] || "Resolution.Hour";

  return [
    "from AlgorithmImports import *",
    "",
    "class StratForgeExport(QCAlgorithm):",
    "    def Initialize(self):",
    "        self.SetStartDate(2022, 1, 1)",
    "        self.SetCash(1000)",
    '        self.symbol = self.AddCrypto("BTCUSDT", ' + res + ").Symbol",
    "        self.rsi = self.RSI(self.symbol, " + len + ", MovingAverageType.Wilders, " + res + ")",
    "        self.SetWarmUp(" + (len + 5) + ", " + res + ")",
    "",
    "    def OnData(self, data: Slice):",
    "        if self.IsWarmingUp: return",
    "        if not self.rsi.IsReady: return",
    "",
    "        r = float(self.rsi.Current.Value)",
    "",
    "        if not self.Portfolio[self.symbol].Invested:",
    "            if r " + eop + " " + entryVal + ":",
    "                self.SetHoldings(self.symbol, 1.0)",
    "        else:",
    "            if r " + xop + " " + exitVal + ":",
    "                self.Liquidate(self.symbol)",
    ""
  ].join("\n");
}

export default function ExportClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const id = useMemo(() => sp.get("id"), [sp]);

  const [strat, setStrat] = useState<StrategyRow | null>(null);
  const [pine, setPine] = useState("");
  const [qc, setQc] = useState("");
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setErr(null);

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
    setPine(buildPine(row));
    setQc(buildQuantConnectPython(row));
    setBusy(false);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copié ✅");
    } catch {
      alert("Impossible de copier automatiquement. Sélectionne et copie manuellement.");
    }
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
            <h1 className="text-2xl font-bold">Export</h1>
            <div className="text-sm text-gray-600">{strat ? strat.name : ""}</div>
          </div>
          <div className="flex gap-2">
            <a className="rounded-md border px-4 py-2" href="/dashboard">Retour</a>
          </div>
        </div>

        {err && <div className="rounded-md border p-3 text-sm text-red-600">Erreur: {err}</div>}
        {busy ? (
          <div className="text-sm text-gray-600">Chargement...</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold">TradingView (Pine Script)</div>
                <button className="rounded-md border px-3 py-2 text-sm" onClick={() => copy(pine)}>Copier</button>
              </div>
              <textarea className="w-full rounded-md border p-3 font-mono text-sm" rows={16} value={pine} readOnly />
            </div>

            <div className="rounded-md border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold">QuantConnect (Python)</div>
                <button className="rounded-md border px-3 py-2 text-sm" onClick={() => copy(qc)}>Copier</button>
              </div>
              <textarea className="w-full rounded-md border p-3 font-mono text-sm" rows={18} value={qc} readOnly />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
