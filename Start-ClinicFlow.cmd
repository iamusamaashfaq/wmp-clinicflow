@echo off
cd /d "%~dp0"
if not exist node_modules call npm install
if not exist .env (
  echo Create .env using .env.example and add your DNotifier credentials and staff password.
  pause
  exit /b 1
)
call npm start
pause
