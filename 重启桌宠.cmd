@echo off
rem Force a fresh start of the pet: stop any running copy first, then launch.
rem Keep this file ASCII-only: cmd.exe reads .cmd content in the console code
rem page, so a UTF-8 path or message here would be mangled on a GBK system.
setlocal
set "PET_DIR=%~dp0"
set "PET_EXE=%PET_DIR%app\node_modules\electron\dist\electron.exe"

if not exist "%PET_EXE%" (
  echo Electron is not installed yet.
  echo Run:  cd /d "%PET_DIR%app"  ^&^&  pnpm install
  pause
  exit /b 1
)

taskkill /IM electron.exe /F >nul 2>nul
ping -n 2 127.0.0.1 >nul

set ELECTRON_RUN_AS_NODE=
set ELECTRON_NO_ATTACH_CONSOLE=
start "" "%PET_EXE%" "%PET_DIR%app"
exit /b 0
