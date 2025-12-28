Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function WriteUtf8NoBom([string]$path, [string]$content) {
  $dir = Split-Path $path -Parent
  if ($dir -and !(Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  [System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))
}

function FixMojibake([string]$text) {
  $latin1 = [System.Text.Encoding]::GetEncoding(28591)  # ISO-8859-1
  $utf8   = [System.Text.Encoding]::UTF8
  return $utf8.GetString($latin1.GetBytes($text))
}

$targets = @(
  ".\app",
  ".\src\app",
  ".\lib",
  ".\src\lib",
  ".\components",
  ".\src\components"
) | Where-Object { Test-Path -LiteralPath $_ }

$includes = @("*.ts","*.tsx","*.js","*.jsx","*.css","*.md","*.json")

$checkedCount = 0
$fixedCount = 0
$fixedFiles = New-Object System.Collections.Generic.List[string]

foreach ($t in $targets) {
  $files = Get-ChildItem -LiteralPath $t -Recurse -File -Include $includes -ErrorAction SilentlyContinue
  foreach ($f in $files) {
    $checkedCount++
    $raw = Get-Content -LiteralPath $f.FullName -Raw

    # Détection SAFE (uniquement ASCII), donc aucun souci de parsing PowerShell
    $looksBroken = (
      ($raw -like "*stratÃ*") -or
      ($raw -like "*ConnectÃ*") -or
      ($raw -like "*DÃ©*") -or
      ($raw -like "*Nouvelle stratÃ*") -or
      ($raw -like "*â€¢*") -or
      ($raw -like "*â†*") -or
      ($raw -like "*Â*")
    )

    if ($looksBroken) {
      $fixed = FixMojibake $raw
      if ($fixed -ne $raw) {
        WriteUtf8NoBom $f.FullName $fixed
        $fixedCount++
        $fixedFiles.Add($f.FullName) | Out-Null
      }
    }
  }
}

Write-Host ("OK: fichiers scannés = {0}" -f $checkedCount) -ForegroundColor Cyan
Write-Host ("OK: fichiers corrigés = {0}" -f $fixedCount) -ForegroundColor Green
if ($fixedFiles.Count -gt 0) {
  Write-Host "Fichiers modifiés :" -ForegroundColor Yellow
  $fixedFiles | ForEach-Object { " - $_" }
}
