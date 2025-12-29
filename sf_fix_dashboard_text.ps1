Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function WriteUtf8NoBom([string]$fullPath, [string]$content) {
  $dir = Split-Path $fullPath -Parent
  if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($fullPath, $content, (New-Object System.Text.UTF8Encoding($false)))
}

# Detect APPROOT
$APPROOT = ""
if (Test-Path ".\src\app") { $APPROOT = ".\src\app" }
elseif (Test-Path ".\app") { $APPROOT = ".\app" }
else { throw "ERREUR: ni .\src\app ni .\app trouvés." }

$dash = Join-Path (Get-Location) (Join-Path $APPROOT "dashboard\page.tsx")
if (!(Test-Path $dash)) { throw "ERREUR: dashboard introuvable: $dash" }

$t = Get-Content $dash -Raw -Encoding UTF8

# 1) "Connecte: ..."
$re1 = [regex]'<div className="text-sm text-gray-600">\s*Connect[^<]*</div>'
$t = $re1.Replace($t, '<div className="text-sm text-gray-600">Connecte: {email || "..."}</div>', 1)

# 2) "+ Nouvelle strategie"
$re2 = [regex]'\+\s*Nouvelle\s*[^<]*'
$t = $re2.Replace($t, '+ Nouvelle strategie', 1)

# 3) "Deconnexion"
$re3 = [regex]'D[^<]*connexion'
$t = $re3.Replace($t, 'Deconnexion', 1)

# 4) "Mes strategies"
$re4 = [regex]'<div className="border-b p-3 text-sm font-semibold">[^<]*</div>'
$t = $re4.Replace($t, '<div className="border-b p-3 text-sm font-semibold">Mes strategies</div>', 1)

# 5) Empty state message
$re5 = [regex]'Aucune[^<]*</div>'
$t = $re5.Replace($t, 'Aucune strategie. Cree ta premiere strategie.</div>', 1)

# 6) "{s.symbol} - {s.timeframe}"
$re6 = [regex]'<div className="text-sm text-gray-600">\s*\{s\.symbol\}[\s\S]*?\{s\.timeframe\}\s*</div>'
$t = $re6.Replace($t, '<div className="text-sm text-gray-600">{s.symbol} - {s.timeframe}</div>', 1)

# 7) "Editer" (replace any corrupted "…diter" label)
$re7 = [regex]'>\s*[^<]*diter\s*'
$t = $re7.Replace($t, '>Editer', 1)

# 8) "<- Retour" for the home link
$re8 = [regex]'(<a className="text-sm underline" href="/">)[\s\S]*?(</a>)'
$t = $re8.Replace($t, '$1<- Retour$2', 1)

WriteUtf8NoBom $dash $t

# Sanity check
$chk = Get-Content $dash -Raw -Encoding UTF8
if ($chk -match "[\uFFFDÃâ]") {
  Write-Host "ATTENTION: il reste du texte corrompu dans dashboard/page.tsx" -ForegroundColor Yellow
} else {
  Write-Host "OK: dashboard/page.tsx nettoye (ASCII + UTF-8 no BOM)" -ForegroundColor Green
}
