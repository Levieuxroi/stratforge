Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-AppRoot {
  if (Test-Path ".\src\app") { return ".\src\app" }
  if (Test-Path ".\app")     { return ".\app" }
  throw "APPROOT introuvable: ni .\src\app ni .\app"
}

function Read-TextSmart([string]$path) {
  $bytes = [System.IO.File]::ReadAllBytes($path)

  $utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
  try {
    return $utf8Strict.GetString($bytes)
  } catch {
    $cp1252 = [System.Text.Encoding]::GetEncoding(1252)
    return $cp1252.GetString($bytes)
  }
}

function Write-Utf8NoBom([string]$path, [string]$text) {
  $dir = Split-Path $path -Parent
  if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
}

$APPROOT = Get-AppRoot
Write-Host ("OK: APPROOT = " + $APPROOT) -ForegroundColor Green

# chars (no accent literals in script)
$REP   = [char]0xFFFD  # �
$BOM   = [char]0xFEFF  # BOM
$A_C2  = [char]0x00C2  # Â
$C3    = [char]0x00C3  # Ã

$e     = [char]0x00E9  # é
$e_gr  = [char]0x00E8  # è
$e_hat = [char]0x00EA  # ê
$a_gr  = [char]0x00E0  # à
$c_ced = [char]0x00E7  # ç
$u_gr  = [char]0x00F9  # ù
$Ecap  = [char]0x00C9  # É

$bullet = [char]0x2022 # •
$arrow  = [char]0x2190 # ←
$rsquo  = [char]0x2019 # ’

# mojibake (UTF-8 read as cp1252)
$bad_A_e      = "" + $C3 + [char]0x00A9  # Ã©
$bad_A_e_gr   = "" + $C3 + [char]0x00A8  # Ã¨
$bad_A_e_hat  = "" + $C3 + [char]0x00AA  # Ãª
$bad_A_a_gr   = "" + $C3 + [char]0x00A0  # Ã 
$bad_A_c_ced  = "" + $C3 + [char]0x00A7  # Ã§
$bad_A_u_gr   = "" + $C3 + [char]0x00B9  # Ã¹
$bad_A_Ecap   = "" + $C3 + [char]0x0089  # Ã‰ (rare)

$bad_bullet = "" + [char]0x00E2 + [char]0x20AC + [char]0x00A2  # â€¢
$bad_rsquo  = "" + [char]0x00E2 + [char]0x20AC + [char]0x2122  # â€™

$roots = @(".\lib", ".\app", ".\src\app") | Where-Object { Test-Path $_ }

# IMPORTANT: pas de pipe sur un foreach => on collecte puis on trie
$files = @()
foreach ($r in $roots) {
  $found = Get-ChildItem -Path $r -Recurse -File -Include *.ts,*.tsx,*.js,*.jsx -ErrorAction SilentlyContinue
  if ($found) { $files += $found }
}
$files = $files | Sort-Object FullName -Unique

if (-not $files -or $files.Count -eq 0) {
  Write-Host "Aucun fichier TS/TSX/JS/JSX trouvé à corriger." -ForegroundColor Yellow
  exit 0
}

$changed = @()

foreach ($f in $files) {
  $text = Read-TextSmart $f.FullName
  $orig = $text

  # remove BOM and stray Â
  $text = $text.Replace([string]$BOM, "")
  $text = $text.Replace([string]$A_C2, "")

  # main mojibake fixes
  $text = $text.Replace($bad_A_e,     [string]$e)
  $text = $text.Replace($bad_A_e_gr,  [string]$e_gr)
  $text = $text.Replace($bad_A_e_hat, [string]$e_hat)
  $text = $text.Replace($bad_A_a_gr,  [string]$a_gr)
  $text = $text.Replace($bad_A_c_ced, [string]$c_ced)
  $text = $text.Replace($bad_A_u_gr,  [string]$u_gr)
  $text = $text.Replace($bad_A_Ecap,  [string]$Ecap)

  $text = $text.Replace($bad_bullet, [string]$bullet)
  $text = $text.Replace($bad_rsquo,  [string]$rsquo)

  # targeted fixes you showed in UI (use concatenation to avoid "$var:" parsing)
  $text = $text.Replace(("Connect" + [string]$REP + ":"), ("Connect" + [string]$e + ":"))
  $text = $text.Replace(("D" + [string]$REP + "connexion"), ("D" + [string]$e + "connexion"))
  $text = $text.Replace(("Nouvelle strat" + [string]$REP + "gie"), ("Nouvelle strat" + [string]$e + "gie"))
  $text = $text.Replace(("Mes strat" + [string]$REP + "gies"), ("Mes strat" + [string]$e + "gies"))
  $text = $text.Replace(([string]$REP + "diter"), ([string]$Ecap + "diter"))

  # Fix arrow before Retour if it became replacement chars
  $patternRetour = [regex]::Escape([string]$REP) + "+\s*Retour"
  $text = [regex]::Replace($text, $patternRetour, ([string]$arrow + " Retour"))

  if ($text -ne $orig) {
    Write-Utf8NoBom $f.FullName $text
    $changed += $f.FullName
  }
}

Write-Host ("OK: fichiers modifiés = " + $changed.Count) -ForegroundColor Green
if ($changed.Count -gt 0) { $changed | ForEach-Object { Write-Host (" - " + $_) } }

Write-Host "DONE. Lance maintenant: npm run build puis npm run dev" -ForegroundColor Green
