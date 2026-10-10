$Host.UI.RawUI.WindowTitle = "SHADOW BASILISK - DISCORD SETUP"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "==========================================" -ForegroundColor DarkYellow
Write-Host "      SHADOW BASILISK DISCORD SETUP" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor DarkYellow
Write-Host ""
Write-Host "Ctrl+V = Paste   Ctrl+C = Cancel/Stop" -ForegroundColor Cyan
Write-Host ""

$clientId = Read-Host "ID Client (DISCORD_CLIENT_ID)"
if ([string]::IsNullOrWhiteSpace($clientId)) {
    Write-Host "[ERROR] DISCORD_CLIENT_ID is required." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

$clientSecret = Read-Host "Client Secret (DISCORD_CLIENT_SECRET)"
if ([string]::IsNullOrWhiteSpace($clientSecret)) {
    Write-Host "[ERROR] DISCORD_CLIENT_SECRET is required." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

$defaultRedirect = "http://localhost:3000/auth/discord/callback"
$redirectUri = Read-Host "Redirect URI [$defaultRedirect]"
if ([string]::IsNullOrWhiteSpace($redirectUri)) {
    $redirectUri = $defaultRedirect
}

Write-Host ""
Write-Host "----- VERIFY / AUTO ROLE / LOG -----" -ForegroundColor DarkYellow
Write-Host ""

$botToken = Read-Host "Bot Token"
$guildId = Read-Host "Server ID / Guild ID"
$roleId = Read-Host "Verify Role ID"
Write-Host "LOG CHANNELS (สร้างแยก 3 ห้อง)" -ForegroundColor DarkYellow
$loginLogChannelId = Read-Host "1. Discord Login Log Channel ID"
$verifyLogChannelId = Read-Host "2. ยืนยันตัวตน Log Channel ID"
$resetLogChannelId = Read-Host "3. ปลดล็อกการยืนยันใหม่ Log Channel ID"
$adminRoleId = Read-Host "Admin Role ID (optional)"
$adminDiscordIds = Read-Host "Admin Discord IDs, comma separated (optional)"

$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$sessionSecret = -join ($bytes | ForEach-Object { $_.ToString("x2") })

$envContent = @"
DISCORD_CLIENT_ID=$clientId
DISCORD_CLIENT_SECRET=$clientSecret
DISCORD_REDIRECT_URI=$redirectUri
SESSION_SECRET=$sessionSecret

DISCORD_BOT_TOKEN=$botToken
DISCORD_GUILD_ID=$guildId
DISCORD_VERIFY_ROLE_ID=$roleId
DISCORD_LOGIN_LOG_CHANNEL_ID=$loginLogChannelId
DISCORD_VERIFY_LOG_CHANNEL_ID=$verifyLogChannelId
DISCORD_RESET_LOG_CHANNEL_ID=$resetLogChannelId
DISCORD_ADMIN_ROLE_ID=$adminRoleId
ADMIN_DISCORD_IDS=$adminDiscordIds

PORT=3000
"@

$envPath = Join-Path $PSScriptRoot ".env"
[System.IO.File]::WriteAllText(
    $envPath,
    $envContent,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host ""
Write-Host "==========================================" -ForegroundColor DarkYellow
Write-Host "SETUP COMPLETE" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor DarkYellow
Write-Host ""
Write-Host ".env created:" -ForegroundColor Gray
Write-Host $envPath -ForegroundColor White
Write-Host ""
Write-Host "Discord OAuth2 Redirect:" -ForegroundColor Gray
Write-Host $redirectUri -ForegroundColor Cyan
Write-Host ""
Write-Host "Discord Login Log Channel:" -ForegroundColor Gray
Write-Host $loginLogChannelId -ForegroundColor Cyan
Write-Host "Verify Log Channel:" -ForegroundColor Gray
Write-Host $verifyLogChannelId -ForegroundColor Cyan
Write-Host "Reset Verify Log Channel:" -ForegroundColor Gray
Write-Host $resetLogChannelId -ForegroundColor Cyan
Write-Host ""
Write-Host "Next: open START.bat" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to close"
