Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function WriteUtf8NoBom([string]$path, [string]$text) {
  $full = Join-Path (Get-Location) $path
  $dir  = Split-Path $full -Parent
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  [System.IO.File]::WriteAllText($full, $text, (New-Object System.Text.UTF8Encoding($false)))
}

# --- Detect APPROOT ---
$APPROOT = if (Test-Path ".\src\app") { ".\src\app" } elseif (Test-Path ".\app") { ".\app" } else { throw "ERREUR: ni .\src\app ni .\app trouvés." }

# --- Fix dashboard parse + accents ---
$dash = Join-Path $APPROOT "dashboard\page.tsx"
if (!(Test-Path $dash)) { throw "ERREUR: introuvable: $dash" }

Copy-Item $dash ($dash + ".bak_" + (Get-Date -Format "yyyyMMdd_HHmmss")) -Force

$txt = [System.IO.File]::ReadAllText($dash, (New-Object System.Text.UTF8Encoding($false)))

# Fix tailwind class fragments that became px... (keeps UI same, just repairs text)
$txt = $txt.Replace('rounded-md border px...2 text-sm',  'rounded-md border px-3 py-2 text-sm')
$txt = $txt.Replace('rounded-md border px...-2 text-sm', 'rounded-md border px-3 py-2 text-sm')
$txt = $txt.Replace('rounded-md border px...y-2 text-sm','rounded-md border px-3 py-2 text-sm')

# Repair mojibake WITHOUT typing accented chars in the script
$rep    = [char]0xFFFD
$copy   = [char]0x00A9
$dier   = [char]0x00A8
$eacute = [char]0x00E9
$egrave = [char]0x00E8
$Eacute = [char]0x00C9
$bullet = [char]0x2022
$arrowL = [char]0x2190
$ctrl90 = [char]0x0090
$acirc  = [char]0x00E2

$txt = $txt.Replace(("Connect" + $rep + "f" + $copy + ":"), ("Connect" + $eacute + ":"))
$txt = $txt.Replace(("D"       + $rep + "f" + $copy + "connexion"), ("D" + $eacute + "connexion"))
$txt = $txt.Replace(("strat"   + $rep + "f" + $copy + "gie"), ("strat" + $eacute + "gie"))
$txt = $txt.Replace(("Cr"      + $rep + "f" + $copy + "e"), ("Cr" + $eacute + "e"))
$txt = $txt.Replace(("premi"   + $rep + "f" + $dier + "re"), ("premi" + $egrave + "re"))
$txt = $txt.Replace(($acirc + $rep + "," + $rep + [char]0x00A2), (" " + $bullet + " "))
$txt = $txt.Replace(($acirc + $rep + "?" + $rep + $ctrl90), ($arrowL + " "))

# Fix corrupted "Éditer" label variants
$badEdit = ($rep + "f" + $rep + "?" + $Eacute + "diter")
$goodEdit = ($Eacute + "diter")
$txt = $txt.Replace($badEdit, $goodEdit)

# CRITICAL: fix broken JSX button that causes "Unterminated regexp literal"
# Rewrites any Edit button with broken onClick into a valid one
$replacement = '<button className="rounded-md border px-3 py-2 text-sm" onClick={() => router.push("/builder?id=" + s.id)}>' + "`r`n" +
              ('                      ' + $goodEdit) + "`r`n" +
              '                    </button>'

$txt = [regex]::Replace($txt, '(?is)<button[^>]*onClick=\{\(\)\s*=>.*?diter.*?</button>', $replacement)

# Write back as UTF-8 no BOM
[System.IO.File]::WriteAllText($dash, $txt, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "OK: dashboard réparé: $dash" -ForegroundColor Green

# --- Fix favicon.ico build error (corrupt ico) ---
$ico = Join-Path $APPROOT "favicon.ico"
if (Test-Path $ico) {
  Remove-Item $ico -Force
  Write-Host "OK: favicon.ico supprimé (corrompu)" -ForegroundColor Green
}

# Create a minimal valid icon.png if missing (Next will use it)
$png = Join-Path $APPROOT "icon.png"
if (!(Test-Path $png)) {
  $b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ZkAAAAASUVORK5CYII="
  [System.IO.File]::WriteAllBytes($png, [Convert]::FromBase64String($b64))
  Write-Host "OK: icon.png créé: $png" -ForegroundColor Green
} else {
  Write-Host "OK: icon.png déjà présent: $png" -ForegroundColor Green
}

Write-Host "✅ Script terminé. Lance maintenant: npm run build" -ForegroundColor Green
