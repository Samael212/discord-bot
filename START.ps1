$Host.UI.RawUI.WindowTitle = "SHADOW BASILISK WEBSITE"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "==========================================" -ForegroundColor DarkYellow
Write-Host "        SHADOW BASILISK WEBSITE" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor DarkYellow
Write-Host ""
Write-Host "Ctrl+C = Stop server" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js not found." -ForegroundColor Red
    return
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] npm not found." -ForegroundColor Red
    return
}

if (-not (Test-Path ".env")) {
    Write-Host "[ERROR] .env not found. Run SETUP-DISCORD.bat first." -ForegroundColor Red
    return
}

if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] Installing packages..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] npm install failed." -ForegroundColor Red
        return
    }
}

# ------------------------------------------------------------
# FIX: EADDRINUSE / port 3000 already in use
#
# This launcher finds the process that is actually listening on
# 127.0.0.1:3000. If it is a Node process running server.js,
# it is treated as an old Shadow Basilisk server and stopped.
# This is more reliable than checking the script path because
# `npm start` often launches `node server.js` without the full path.
# Unrelated non-Node programs are NEVER killed automatically.
# ------------------------------------------------------------
$port = 3000

function Get-ListeningPids([int]$TargetPort) {
    $rows = @()
    try {
        $connections = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue
        foreach ($c in $connections) {
            if ($c.OwningProcess -and $c.OwningProcess -gt 0) {
                $rows += [int]$c.OwningProcess
            }
        }
    } catch {
        # Fallback for systems where Get-NetTCPConnection is unavailable.
        try {
            $lines = netstat -ano -p tcp 2>$null | Select-String ":$TargetPort\s+.*LISTENING\s+(\d+)"
            foreach ($line in $lines) {
                if ($line.Matches.Count -gt 0) {
                    $rows += [int]$line.Matches[0].Groups[1].Value
                }
            }
        } catch {}
    }
    return @($rows | Sort-Object -Unique)
}

$listeningPids = Get-ListeningPids $port

foreach ($processId in $listeningPids) {
    if ($processId -le 0) { continue }

    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if (-not $proc) { continue }

    $name = [string]$proc.Name
    $cmd  = [string]$proc.CommandLine
    $isNodeServer = ($name -ieq "node.exe") -and ($cmd -match '(?i)(^|[\\/\s"''])server\.js([\s"'']|$)')

    if ($isNodeServer) {
        Write-Host "[INFO] Found an existing Node server.js on port $port (PID $processId)." -ForegroundColor Yellow
        Write-Host "[INFO] Stopping it so the new server can start cleanly..." -ForegroundColor Yellow
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "[ERROR] Port $port is already used by another program." -ForegroundColor Red
        Write-Host "[INFO] PID: $processId" -ForegroundColor Yellow
        Write-Host "[INFO] Process: $name" -ForegroundColor Yellow
        Write-Host "[INFO] Close that program, then run START.bat again." -ForegroundColor Yellow
        return
    }
}

# Wait briefly for the port to be released after stopping an old server.
for ($i = 0; $i -lt 10; $i++) {
    if (@(Get-ListeningPids $port).Count -eq 0) { break }
    Start-Sleep -Milliseconds 250
}

if (@(Get-ListeningPids $port).Count -gt 0) {
    Write-Host "[ERROR] Port $port is still in use. Server was not started." -ForegroundColor Red
    Write-Host "[INFO] Run: netstat -ano | findstr :$port" -ForegroundColor Yellow
    return
}

Write-Host ""
Write-Host "Website : http://localhost:3000" -ForegroundColor Cyan
Write-Host "Health  : http://localhost:3000/health" -ForegroundColor Cyan
Write-Host "Mode    : LOCAL ONLY" -ForegroundColor DarkGray
Write-Host ""

npm start

Write-Host ""
Write-Host "Server stopped. Window remains open." -ForegroundColor Yellow
