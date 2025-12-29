Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function EnsureDir([string]$path) {
  if (!(Test-Path $path)) { New-Item -ItemType Directory -Force -Path $path | Out-Null }
}

function WriteUtf8NoBom([string]$fullPath, [string]$content) {
  $dir = Split-Path $fullPath -Parent
  if ($dir) { EnsureDir $dir }
  [System.IO.File]::WriteAllText($fullPath, $content, (New-Object System.Text.UTF8Encoding($false)))
}

# 0) Detect APPROOT
$appRoot = ""
if (Test-Path ".\src\app") { $appRoot = ".\src\app" }
elseif (Test-Path ".\app") { $appRoot = ".\app" }
else { throw "ERREUR: ni .\src\app ni .\app trouvés. Tu es bien dans C:\Dev\stratforge ?" }

Write-Host "OK: APPROOT = $appRoot" -ForegroundColor Green

# 1) Fix icon/build issues (remove broken favicon, ensure icon.png exists)
$iconDir = Join-Path (Get-Location) $appRoot
EnsureDir $iconDir

$favicon = Join-Path $iconDir "favicon.ico"
if (Test-Path $favicon) {
  Remove-Item $favicon -Force
  Write-Host "OK: favicon.ico supprimé (evite l'erreur decode image)" -ForegroundColor Green
}

$iconPng = Join-Path $iconDir "icon.png"
$pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/P0d8VwAAAABJRU5ErkJggg=="
[IO.File]::WriteAllBytes($iconPng, [Convert]::FromBase64String($pngB64))
Write-Host "OK: icon.png écrit: $iconPng" -ForegroundColor Green

# 2) Fix mojibake in dashboard/page.tsx
$dash = Join-Path $iconDir "dashboard\page.tsx"
if (!(Test-Path $dash)) { throw "ERREUR: dashboard introuvable: $dash" }

# Read as UTF-8 (invalid sequences become U+FFFD automatically)
$bytes = [IO.File]::ReadAllBytes($dash)
$text  = [Text.Encoding]::UTF8.GetString($bytes)

# Replace corrupted labels (ASCII only)
$text = [regex]::Replace($text, '<div className="text-sm text-gray-600">\s*Connect[^<]*</div>',
  '<div className="text-sm text-gray-600">Connecte: {email || "..."}</div>', 1)

$text = [regex]::Replace($text, '\+\s*Nouvelle\s*[^<]*', '+ Nouvelle strategie', 1)

$text = [regex]::Replace($text, 'D[^<]{0,60}connexion', 'Deconnexion', 1)

$text = [regex]::Replace($text, '<div className="border-b p-3 text-sm font-semibold">[^<]*</div>',
  '<div className="border-b p-3 text-sm font-semibold">Mes strategies</div>', 1)

$text = [regex]::Replace($text, 'Aucune[^<]*</div>',
  'Aucune strategie. Cree ta premiere strategie.</div>', 1)

$text = [regex]::Replace($text, '<div className="text-sm text-gray-600">\s*\{s\.symbol\}[\s\S]*?\{s\.timeframe\}\s*</div>',
  '<div className="text-sm text-gray-600">{s.symbol} - {s.timeframe}</div>', 1)

$text = [regex]::Replace($text, '>\s*[^<]*diter\s*', '>Editer', 1)

$text = [regex]::Replace($text, '(<a className="text-sm underline" href="/">)[\s\S]*?(</a>)',
  '$1<- Retour$2', 1)

WriteUtf8NoBom $dash $text
Write-Host "OK: dashboard/page.tsx nettoye + reecrit en UTF-8 no BOM" -ForegroundColor Green

$rep = [char]0xFFFD
if ($text.Contains($rep)) {
  Write-Host "ATTENTION: il reste encore des caracteres corrompus (U+FFFD) dans dashboard/page.tsx" -ForegroundColor Yellow
} else {
  Write-Host "OK: plus de caracteres corrompus detectes dans dashboard/page.tsx" -ForegroundColor Green
}
