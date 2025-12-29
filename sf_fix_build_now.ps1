Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function EnsureDir([string]$filePath) {
  $dir = Split-Path -Parent $filePath
  if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
}

function WriteUtf8NoBom([string]$filePath, [string]$content) {
  EnsureDir $filePath
  [System.IO.File]::WriteAllText($filePath, $content, (New-Object System.Text.UTF8Encoding($false)))
}

function WriteBytesFromB64([string]$filePath, [string]$b64) {
  EnsureDir $filePath
  $clean = ($b64 -replace '\s','')
  [System.IO.File]::WriteAllBytes($filePath, [Convert]::FromBase64String($clean))
}

# Detect APPROOT
$APPROOT = ""
if (Test-Path ".\src\app") { $APPROOT = ".\src\app" }
elseif (Test-Path ".\app") { $APPROOT = ".\app" }
else { throw "ERREUR: ni .\src\app ni .\app trouves." }

Write-Host "OK: APPROOT = $APPROOT" -ForegroundColor Green

# Choose correct lib import path (app vs src/app)
$libRel = if ($APPROOT -eq ".\src\app") { "../../../lib/supabaseClient" } else { "../../lib/supabaseClient" }
$libRelHeader = if ($APPROOT -eq ".\src\app") { "../../../lib/supabaseClient" } else { "../../lib/supabaseClient" }

# --- 1) Rewrite DashboardHeader.tsx (safe + robust path) ---
$headerPath = Join-Path $APPROOT "_components\DashboardHeader.tsx"
$header = @"
"use client";

import { useEffect, useState } from "react";
import { supabase } from "__LIBPATH__";

type Plan = "free" | "pro" | "elite";

export default function DashboardHeader() {
  const [plan, setPlan] = useState<Plan>("free");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", session.user.id)
        .maybeSingle();

      const p = (prof?.plan || "free") as Plan;
      setPlan(p);
    })();
  }, []);

  const badge = plan === "elite" ? "ELITE" : plan === "pro" ? "PRO" : "FREE";

  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="text-sm text-gray-600">
        Plan:
        <span className="ml-2 rounded-full border px-2 py-1 text-xs font-bold">
          {badge}
        </span>
      </div>

      {plan === "free" && (
        <a href="/pricing" className="rounded-md border px-3 py-2 text-sm">
          Upgrade
        </a>
      )}
    </div>
  );
}
"@ -replace "__LIBPATH__", $libRelHeader

WriteUtf8NoBom $headerPath $header
Write-Host "OK: DashboardHeader.tsx OK" -ForegroundColor Green

# --- 2) Rewrite dashboard/page.tsx (fix JSX + fix mojibake via HTML entities) ---
$dashPath = Join-Path $APPROOT "dashboard\page.tsx"
$dash = @"
"use client";

import DashboardHeader from "../_components/DashboardHeader";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "__LIBPATH__";

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
      <div data-sf-dashboard-header="1">
        <DashboardHeader />
      </div>

      <div data-sf-upgrade-toolbar="1" className="mt-4 flex flex-wrap gap-2">
        <a href="/pricing" className="rounded-md border px-4 py-2">Upgrade</a>
        <a href="/forward" className="rounded-md border px-4 py-2">Forward</a>
        <a href="/signals" className="rounded-md border px-4 py-2">Signals</a>
      </div>

      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <div className="text-sm text-gray-600">Connect&eacute;: {email || "..."}</div>
          </div>

          <div className="flex gap-2 pointer-events-auto">
            <button
              type="button"
              className="rounded-md bg-black px-4 py-2 text-white cursor-pointer pointer-events-auto"
              onClick={() => router.push("/builder")}
            >
              + Nouvelle strat&eacute;gie
            </button>

            <button
              type="button"
              className="rounded-md border px-4 py-2 cursor-pointer pointer-events-auto"
              onClick={logout}
            >
              D&eacute;connexion
            </button>
          </div>
        </div>

        <div className="rounded-md border">
          <div className="border-b p-3 text-sm font-semibold">Mes strat&eacute;gies</div>

          {busy ? (
            <div className="p-3 text-sm text-gray-600">Chargement...</div>
          ) : err ? (
            <div className="p-3 text-sm text-red-600">Erreur: {err}</div>
          ) : rows.length === 0 ? (
            <div className="p-3 text-sm text-gray-600">
              Aucune strat&eacute;gie. Cr&eacute;e ta premi&egrave;re strat&eacute;gie.
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((s) => (
                <div key={s.id} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-sm text-gray-600">
                      {s.symbol} &bull; {s.timeframe}
                    </div>
                  </div>

                  <div className="flex gap-2 pointer-events-auto">
                    <button
                      type="button"
                      className="rounded-md border px-3 py-2 text-sm"
                      onClick={() => router.push("/backtest?id=" + s.id)}
                    >
                      Backtest
                    </button>
                    <button
                      type="button"
                      className="rounded-md border px-3 py-2 text-sm"
                      onClick={() => router.push("/forward?id=" + s.id)}
                    >
                      Forward
                    </button>
                    <button
                      type="button"
                      className="rounded-md border px-3 py-2 text-sm"
                      onClick={() => router.push("/export?id=" + s.id)}
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      className="rounded-md border px-3 py-2 text-sm"
                      onClick={() => router.push("/builder?id=" + s.id)}
                    >
                      &Eacute;diter
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <a className="text-sm underline" href="/">
          &#8592; Retour
        </a>
      </div>
    </main>
  );
}
"@ -replace "__LIBPATH__", $libRel

WriteUtf8NoBom $dashPath $dash
Write-Host "OK: dashboard/page.tsx OK" -ForegroundColor Green

# --- 3) Replace corrupted icons with valid ones ---
$pngB64 = @"
iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAF7UlEQVR4nO3cS27cMBBA0Q9QO0ZB
oE8W8VhCqGgIhVwqz8hGxR4s7m9sO2n0kq1y3y8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAA== 
"@

$icoB64 = @"
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
"@

WriteBytesFromB64 (Join-Path $APPROOT "icon.png") $pngB64
WriteBytesFromB64 (Join-Path $APPROOT "favicon.ico") $icoB64
Write-Host "OK: icon.png + favicon.ico OK" -ForegroundColor Green

Write-Host "DONE. Running build..." -ForegroundColor Green