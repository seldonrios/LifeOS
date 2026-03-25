@echo off
setlocal

for %%I in ("%~dp0..") do set "DESKTOP_DIR=%%~fI"
set "SRC_TAURI_DIR=%DESKTOP_DIR%\src-tauri"
set "BIN_DIR=%SRC_TAURI_DIR%\binaries"
set "MSVC_SIDECAR=%BIN_DIR%\lifeos-sidecar-x86_64-pc-windows-msvc.exe"

call pnpm --dir "%DESKTOP_DIR%" run sidecar:package:msvc
if errorlevel 1 (
  echo [lifeos-desktop] Failed to package sidecar binary for MSVC.
  exit /b 1
)

if not exist "%MSVC_SIDECAR%" (
  echo [lifeos-desktop] Missing sidecar binary: %MSVC_SIDECAR%
  echo [lifeos-desktop] Packaging completed without producing the expected MSVC artifact.
  exit /b 1
)

set "VCVARS=%LIFEOS_VCVARS_PATH%"
if "%VCVARS%"=="" set "VCVARS=F:\VS\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if not exist "%VCVARS%" (
  echo [lifeos-desktop] vcvars64 not found at: %VCVARS%
  echo [lifeos-desktop] Set LIFEOS_VCVARS_PATH to your vcvars64.bat path.
  exit /b 1
)

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
call "%VCVARS%" >nul 2>&1

set "TAURI_CFG=%TEMP%\lifeos-tauri-dev-override.json"
> "%TAURI_CFG%" echo {"build":{"beforeDevCommand":" "}}

if "%LIFEOS_SKIP_WEB%"=="" (
  start "LifeOS Desktop Web" cmd /c "cd /d \"%DESKTOP_DIR%\" && pnpm dev:web"
)

cd /d "%SRC_TAURI_DIR%"
call ..\node_modules\.bin\tauri.cmd dev --config "%TAURI_CFG%" --no-dev-server-wait

endlocal
