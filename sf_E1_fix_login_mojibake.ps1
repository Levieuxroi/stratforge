Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function WriteUtf8NoBom([string]$path, [string]$content) {
  $dir = Split-Path $path -Parent
  if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))
}

# App root
if (Test-Path ".\src\app") { $APPROOT = ".\src\app" }
elseif (Test-Path ".\app") { $APPROOT = ".\app" }
else { throw "ERREUR: ni .\src\app ni .\app trouvés." }

$loginPage = Join-Path $APPROOT "login\page.tsx"
if (!(Test-Path $loginPage)) { throw "ERREUR: fichier introuvable: $loginPage" }

Write-Host "OK: login page = $loginPage" -ForegroundColor Green

# Read bytes (robuste même si ancien encodage)
$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $loginPage))
$text  = [System.Text.Encoding]::UTF8.GetString($bytes)

$orig = $text

# 1) Supprime tout export revalidate (source fréquente des erreurs de prerender)
$text = [regex]::Replace($text, '(?m)^\s*export\s+const\s+revalidate\s*=.*?;\s*\r?\n', '')

# 2) Force placeholder du champ password => ASCII (évite • / mojibake)
$text = [regex]::Replace(
  $text,
  '(?is)(<input\b[^>]*\btype\s*=\s*["'']password["''][^>]*)(>)',
  {
    param($m)
    $attrs = $m.Groups[1].Value

    if ($attrs -match '\bplaceholder\s*=') {
      $attrs = [regex]::Replace(
        $attrs,
        '\bplaceholder\s*=\s*({[^}]*}|"[^"]*"|''[^'']*'')',
        'placeholder="********"'
      )
    } else {
      $attrs = $attrs + ' placeholder="********"'
    }

    return $attrs + $m.Groups[2].Value
  }
)

# 3) Force le lien "Retour" vers une version unicode-safe (ASCII + escape)
#    On cible le lien qui contient "Retour" et pointe vers "/"
$patternBack = '(?is)(?<open><(?<tag>a|Link)\b[^>]*\bhref\s*=\s*(?:"\/"|''\/''|\{["'']\/["'']\})[^>]*>)(?<inner>[^<]*Retour[^<]*)(?<close></\k<tag>>)'
$text2 = [regex]::Replace(
  $text,
  $patternBack,
  {
    param($m)
    return $m.Groups["open"].Value + '{"\u2190"} Retour' + $m.Groups["close"].Value
  }
)

if ($text2 -ne $text) { $text = $text2 }

if ($text -eq $orig) {
  Write-Host "WARN: aucune modif détectée (page.tsx déjà OK ?)" -ForegroundColor Yellow
} else {
  WriteUtf8NoBom $loginPage $text
  Write-Host "OK: /login corrigé (placeholder + retour + UTF-8 noBOM)" -ForegroundColor Green
}

Write-Host ""
Write-Host "NEXT: commit + push :" -ForegroundColor Cyan
Write-Host "  git add -A"
Write-Host "  git commit -m `"fix: login mojibake (password placeholder + retour)`""
Write-Host "  git push"
