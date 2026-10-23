@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 18 or newer, then run this file again.
  pause
  exit /b 1
)
node local-ai.cjs --provider openai
pause
