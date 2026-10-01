@echo off
rem Launch the DSH status pet without keeping a console window around.
rem ELECTRON_RUN_AS_NODE is cleared because a harness-spawned shell may set it,
rem which would otherwise turn Electron into a plain Node interpreter.
setlocal
set "PET_DIR=%~dp0"
set "PET_EXE=%PET_DIR%app\node_modules\electron\dist\electron.exe"

if not exist "%PET_EXE%" (
  echo Electron is not installed yet.
  echo Run:  cd /d "%PET_DIR%app"  ^&^&  pnpm install
  pause
  exit /b 1
)

set ELECTRON_RUN_AS_NODE=
set ELECTRON_NO_ATTACH_CONSOLE=
start "" "%PET_EXE%" "%PET_DIR%app"
exit /b 0
