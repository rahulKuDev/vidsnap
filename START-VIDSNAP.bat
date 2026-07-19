@echo off
title VidSnap — Live Server
color 0A
echo.
echo  ╔══════════════════════════════════════╗
echo  ║      VidSnap — Starting Servers      ║
echo  ╚══════════════════════════════════════╝
echo.

cd /d "%~dp0"

echo [1/3] Building API server...
cd artifacts\api-server
call pnpm run build
if %errorlevel% neq 0 (
    echo BUILD FAILED. Check errors above.
    pause
    exit /b 1
)
echo  API build OK
cd ..\..

echo.
echo [2/3] Starting API server on port 3000...
start "VidSnap API" /min cmd /c "cd /d %~dp0artifacts\api-server && node --enable-source-maps ./dist/index.mjs"

echo  Waiting for API to boot...
timeout /t 3 /nobreak > nul

echo.
echo [3/3] Starting Frontend on port 5173...
start "VidSnap Frontend" cmd /c "cd /d %~dp0artifacts\video-downloader && pnpm run dev"

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   VidSnap is running!                    ║
echo  ║                                          ║
echo  ║   Frontend:  http://localhost:5173       ║
echo  ║   API:       http://localhost:3000       ║
echo  ║                                          ║
echo  ║   Close this window to stop servers     ║
echo  ╚══════════════════════════════════════════╝
echo.
pause
