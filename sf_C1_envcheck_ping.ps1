Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function WriteUtf8NoBomRel([string]$relPath, [string]$content) {
  $full = Join-Path (Get-Location) $relPath
  $dir  = Split-Path $full -Parent
  if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($full, $content, (New-Object System.Text.UTF8Encoding($false)))
}

# Detect APPROOT
$APPROOT = ""
if (Test-Path ".\src\app") { $APPROOT = ".\src\app" }
elseif (Test-Path ".\app") { $APPROOT = ".\app" }
else { throw "ERROR: neither .\src\app nor .\app found." }

Write-Host ("OK: APPROOT = " + $APPROOT) -ForegroundColor Green

# --- /api/ping (GET) ---
$pingTs = @"
export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    now: new Date().toISOString(),
    vercel: {
      ref: process.env.VERCEL_GIT_COMMIT_REF || null,
      sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      env: process.env.VERCEL_ENV || null
    }
  });
}
"@

WriteUtf8NoBomRel "$APPROOT\api\ping\route.ts" $pingTs
Write-Host "OK: /api/ping written" -ForegroundColor Green

# --- /api/envcheck (GET) ---
$envTs = @"
export const runtime = "nodejs";

export async function GET() {
  const b = (v: any) => !!v;
  return Response.json({
    ok: true,
    now: new Date().toISOString(),
    vars: {
      NEXT_PUBLIC_SUPABASE_URL: b(process.env.NEXT_PUBLIC_SUPABASE_URL),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: b(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: b(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
      STRIPE_SECRET_KEY: b(process.env.STRIPE_SECRET_KEY),
      STRIPE_WEBHOOK_SECRET: b(process.env.STRIPE_WEBHOOK_SECRET),
      NEXT_PUBLIC_APP_URL: b(process.env.NEXT_PUBLIC_APP_URL)
    }
  });
}
"@

WriteUtf8NoBomRel "$APPROOT\api\envcheck\route.ts" $envTs
Write-Host "OK: /api/envcheck written" -ForegroundColor Green

# Force redeploy trigger (tiny file change)
$stamp = (Get-Date).ToString("s")
WriteUtf8NoBomRel ".vercel_trigger.txt" ("redeploy " + $stamp + "`n")
Write-Host "OK: .vercel_trigger.txt updated" -ForegroundColor Green

# Build quick check (optional but useful)
npm run build

# Git commit/push (only if there are changes)
try {
  $changes = git status --porcelain
  if ($changes) {
    git add -A
    git commit -m "Add ping + envcheck debug routes"
    git push
    Write-Host "OK: pushed" -ForegroundColor Green
  } else {
    Write-Host "OK: no git changes to commit" -ForegroundColor Yellow
  }
} catch {
  Write-Host ("WARN: git commit/push skipped: " + $_.Exception.Message) -ForegroundColor Yellow
}

Write-Host "DONE" -ForegroundColor Green
