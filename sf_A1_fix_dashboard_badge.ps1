Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function WriteUtf8NoBom([string]$relPath, [string]$content) {
  $full = Join-Path (Get-Location) $relPath
  $dir  = Split-Path $full -Parent
  if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($full, $content, (New-Object System.Text.UTF8Encoding($false)))
}

# 0) Detect APPROOT
$APPROOT = ""
if (Test-Path ".\src\app") { $APPROOT = ".\src\app" }
elseif (Test-Path ".\app") { $APPROOT = ".\app" }
else { throw "ERREUR: ni .\src\app ni .\app trouvés." }

Write-Host "OK: APPROOT = $APPROOT" -ForegroundColor Green

# 1) Import path for supabaseClient depends on APPROOT and file location (app/_components)
$libPath = if ($APPROOT -eq ".\src\app") { "../../../lib/supabaseClient" } else { "../../lib/supabaseClient" }

# 2) Write component app/_components/DashboardHeader.tsx
New-Item -ItemType Directory -Force -Path "$APPROOT\_components" | Out-Null

$tsx = @"
"use client";

import { useEffect, useState } from "react";
import { supabase } from "$libPath";

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

      setPlan((prof?.plan || "free") as Plan);
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
"@

WriteUtf8NoBom "$APPROOT\_components\DashboardHeader.tsx" $tsx
Write-Host "OK: DashboardHeader.tsx écrit" -ForegroundColor Green

# 3) Patch app/dashboard/page.tsx to import + render header once
$DASH = Join-Path $APPROOT "dashboard\page.tsx"
if (!(Test-Path $DASH)) { throw "ERREUR: dashboard introuvable: $DASH" }

$c = Get-Content $DASH -Raw

# 3.1 Ensure import
$importLine = 'import DashboardHeader from "../_components/DashboardHeader";'
if ($c -notmatch [regex]::Escape($importLine)) {
  if ($c -match '"use client";') {
    $c = $c -replace '"use client";', ('"use client";' + "`r`n`r`n" + $importLine)
  } else {
    $c = $importLine + "`r`n" + $c
  }
}

# 3.2 Inject JSX after <main ...> once
if ($c -notmatch 'data-sf-dashboard-header="1"') {
  $inject = '<div data-sf-dashboard-header="1"><DashboardHeader /></div>'

  if ($c -match '<main[^>]*>') {
    $c = [regex]::Replace($c, '<main[^>]*>', { param($m) $m.Value + "`r`n" + $inject }, 1)
  } else {
    $c = $inject + "`r`n" + $c
  }
}

WriteUtf8NoBom "$APPROOT\dashboard\page.tsx" $c
Write-Host "OK: dashboard patché (badge plan)" -ForegroundColor Green

# 4) Quick verification output
Write-Host "---- CHECK ----" -ForegroundColor Cyan
Select-String -Path "$APPROOT\dashboard\page.tsx" -Pattern "DashboardHeader|data-sf-dashboard-header" -Context 0,1
