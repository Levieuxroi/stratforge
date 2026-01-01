Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$BASE = "https://stratforge.vercel.app"
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "=== /api/ping ===" -ForegroundColor Cyan
curl.exe -s -i "$BASE/api/ping?ts=$ts"
Write-Host ""

Write-Host "=== /api/envcheck (attendu 404 tant que DEBUG_DIAG != true) ===" -ForegroundColor Cyan
curl.exe -s -i "$BASE/api/envcheck?ts=$ts"
Write-Host ""

Write-Host "=== /api/cron (manuel) ===" -ForegroundColor Cyan
curl.exe -s -i -H "x-vercel-cron: 1" "$BASE/api/cron?ts=$ts"
Write-Host ""

Write-Host "=== /api/market/bars (POST JSON) ===" -ForegroundColor Cyan
$body = '{"symbol":"BTCUSDT","timeframe":"1h","limit":5}'
curl.exe -s -i -X POST "$BASE/api/market/bars?ts=$ts" -H "Content-Type: application/json" -d $body
Write-Host ""