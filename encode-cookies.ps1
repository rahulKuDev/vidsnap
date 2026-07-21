# ============================================================
# VidSnap — TikTok Cookies Encoder for Railway/Render
# ============================================================
# Ye script cookies.txt file ko base64 mein encode karta hai
# jo Railway mein YTDLP_COOKIES_B64 env var mein paste karna hoga
# ============================================================

param(
    [string]$CookiesFile = ""
)

if (-not $CookiesFile) {
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "  VidSnap — TikTok Cookies Encoder" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Cookies.txt file ka full path enter karo:" -ForegroundColor Yellow
    Write-Host "(Example: C:\Users\LENOVO\Downloads\tiktok_cookies.txt)" -ForegroundColor Gray
    Write-Host ""
    $CookiesFile = Read-Host "Path"
}

if (-not (Test-Path $CookiesFile)) {
    Write-Host ""
    Write-Host "ERROR: File nahi mili: $CookiesFile" -ForegroundColor Red
    Write-Host "Sahi path enter karo." -ForegroundColor Yellow
    exit 1
}

# Read and encode
$content = Get-Content $CookiesFile -Raw -Encoding UTF8
$bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
$encoded = [Convert]::ToBase64String($bytes)

# Copy to clipboard
$encoded | Set-Clipboard

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  Cookies encoded aur clipboard mein copy ho gayi!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Ab 2 jagah paste karo:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. LOCAL .env file mein:" -ForegroundColor Cyan
Write-Host "   YTDLP_COOKIES_B64=<paste here>" -ForegroundColor Gray
Write-Host ""
Write-Host "   YA (simpler for local):" -ForegroundColor Cyan
Write-Host "   YTDLP_COOKIES_FILE=$CookiesFile" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Railway Environment Variables mein:" -ForegroundColor Cyan
Write-Host "   Key:   YTDLP_COOKIES_B64" -ForegroundColor Gray
Write-Host "   Value: <paste from clipboard>" -ForegroundColor Gray
Write-Host ""
Write-Host "Encoded value (first 80 chars):" -ForegroundColor Yellow
Write-Host $encoded.Substring(0, [Math]::Min(80, $encoded.Length)) -ForegroundColor Gray
Write-Host "..." -ForegroundColor Gray
Write-Host ""
Write-Host "Total length: $($encoded.Length) characters" -ForegroundColor Gray
Write-Host ""
