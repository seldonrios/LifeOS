<#
.SYNOPSIS
    Install Rust C++ linker dependencies and run cargo check for apps/desktop/src-tauri.

.DESCRIPTION
    Two paths depending on whether the shell is elevated:

    ADMIN path   -> installs Visual Studio 2022 Build Tools (MSVC + Windows SDK) via
                    Chocolatey, then runs `cargo check`.

    NON-ADMIN path -> installs Scoop (user-scope), then mingw (GNU gcc linker), adds
                    the x86_64-pc-windows-gnu rustup target, writes a local
                    .cargo/config.toml to use that target, then runs `cargo check`.

.NOTES
    Run from repo root. Cargo must already be installed (rustup). If not:
        $exe = "$env:TEMP\rustup-init.exe"
        Invoke-WebRequest -Uri 'https://win.rustup.rs/x86_64' -OutFile $exe
        & $exe -y --default-toolchain stable --profile minimal
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Is-Admin {
    ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Ensure-Cargo {
    $cargoPath = "$env:USERPROFILE\.cargo\bin"
    if ($env:Path -notlike "*$cargoPath*") {
        $env:Path = "$cargoPath;$env:Path"
        Write-Host "[+] Added $cargoPath to PATH"
    }
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        Write-Error "cargo not found. Install Rust first via rustup-init.exe (see .NOTES above)."
    }
    Write-Host "[+] cargo $(cargo --version)"
}

function Run-CargoCheck {
    param([string]$Target)

    # Try to locate apps/desktop/src-tauri relative to the script or cwd
    $candidates = @(
        (Join-Path $PSScriptRoot '..\apps\desktop\src-tauri'),
        (Join-Path (Get-Location) 'apps\desktop\src-tauri')
    )
    $sidecarDir = $null
    foreach ($c in $candidates) {
        try { $sidecarDir = Resolve-Path $c -ErrorAction Stop; break } catch {}
    }
    if (-not $sidecarDir) {
        Write-Error "Cannot locate apps/desktop/src-tauri. Run this script from the repo root."
    }

    Push-Location $sidecarDir
    try {
        if ($Target) {
            Write-Host ""
            Write-Host "[+] Running: cargo check --target $Target"
            cargo check --target $Target
        } else {
            Write-Host ""
            Write-Host "[+] Running: cargo check"
            cargo check
        }
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "[OK] cargo check passed cleanly." -ForegroundColor Green
        } else {
            Write-Host ""
            Write-Host "[FAIL] cargo check exited $LASTEXITCODE" -ForegroundColor Red
            exit $LASTEXITCODE
        }
    } finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# Admin path: VS Build Tools via Chocolatey
# ---------------------------------------------------------------------------

function Install-MsvcToolchain {
    Write-Host ""
    Write-Host "=== Admin path: installing Visual Studio 2022 Build Tools (MSVC + Windows SDK) ==="

    if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
        Write-Error "Chocolatey not found. Install it first: https://chocolatey.org/install"
    }

    $params = '--add Microsoft.VisualStudio.Workload.VCTools ' +
              '--add Microsoft.VisualStudio.Component.Windows11SDK.22621 ' +
              '--includeRecommended --passive --norestart'

    Write-Host "[+] Installing visualstudio2022buildtools..."
    choco install visualstudio2022buildtools --yes --package-parameters $params
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Chocolatey install failed (exit $LASTEXITCODE)."
    }

    # Refresh PATH so link.exe is visible
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('Path','User')

    Write-Host "[+] VS Build Tools installed."
    Ensure-Cargo
    Run-CargoCheck
}

# ---------------------------------------------------------------------------
# Non-admin path: Scoop + MinGW + GNU target
# ---------------------------------------------------------------------------

function Install-GnuToolchain {
    Write-Host ""
    Write-Host "=== Non-admin path: Scoop + MinGW (x86_64-pc-windows-gnu) ==="

    # 1. Install Scoop if missing
    if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
        Write-Host "[+] Installing Scoop (user-scope)..."
        Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
        Invoke-RestMethod -Uri 'https://get.scoop.sh' | Invoke-Expression
        $env:Path = "$env:USERPROFILE\scoop\shims;$env:Path"
    } else {
        Write-Host "[+] Scoop already installed."
    }

    # 2. Install mingw (provides x86_64-w64-mingw32-gcc)
    if (-not (Get-Command x86_64-w64-mingw32-gcc -ErrorAction SilentlyContinue)) {
        Write-Host "[+] Installing mingw via Scoop..."
        scoop install mingw
        $env:Path = "$env:USERPROFILE\scoop\apps\mingw\current\bin;$env:Path"
    } else {
        Write-Host "[+] mingw already installed."
    }

    Ensure-Cargo

    # 3. Install the GNU toolchain and make it the default.
    #    This is critical: build scripts (proc-macros) compile for the HOST target.
    #    If the host remains x86_64-pc-windows-msvc, cargo still calls link.exe for
    #    build scripts even when --target gnu is passed.  Switching the default
    #    toolchain to the GNU variant makes both the host and the final target use
    #    the MinGW linker, so link.exe is never needed.
    Write-Host "[+] Installing stable-x86_64-pc-windows-gnu toolchain..."
    rustup toolchain install stable-x86_64-pc-windows-gnu --profile minimal
    Write-Host "[+] Setting stable-x86_64-pc-windows-gnu as default toolchain..."
    rustup default stable-x86_64-pc-windows-gnu

    # Reload cargo path in case rustup updated shims
    $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"

    # 4. Write .cargo/config.toml inside src-tauri
    $candidates = @(
        (Join-Path $PSScriptRoot '..\apps\desktop\src-tauri'),
        (Join-Path (Get-Location) 'apps\desktop\src-tauri')
    )
    $sidecarDir = $null
    foreach ($c in $candidates) {
        try { $sidecarDir = Resolve-Path $c -ErrorAction Stop; break } catch {}
    }
    if (-not $sidecarDir) {
        $sidecarDir = Join-Path (Get-Location) 'apps\desktop\src-tauri'
    }

    $cargoConfigDir  = Join-Path $sidecarDir '.cargo'
    $cargoConfigFile = Join-Path $cargoConfigDir 'config.toml'

    if (-not (Test-Path $cargoConfigDir)) {
        New-Item -ItemType Directory -Path $cargoConfigDir | Out-Null
    }

    # Configure linker for both the final target AND the host (build scripts).
    $configContent = @"
# Auto-generated by scripts/install-rust-deps.ps1
# Uses MinGW GCC as linker so no MSVC Build Tools are required.
# Both target rows are needed: the first covers final artifacts,
# the second covers build-script compilation on the host.
[target.x86_64-pc-windows-gnu]
linker = "x86_64-w64-mingw32-gcc"

[host]
linker = "x86_64-w64-mingw32-gcc"
"@
    Set-Content -Path $cargoConfigFile -Value $configContent -Encoding UTF8
    Write-Host "[+] Wrote $cargoConfigFile"

    # No explicit --target needed: default toolchain IS the gnu target now.
    Run-CargoCheck
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

Write-Host "LifeOS - Rust dependency installer and compile check"
Write-Host "====================================================="

if (Is-Admin) {
    Write-Host "[*] Running as Administrator - using MSVC (recommended) path."
    Install-MsvcToolchain
} else {
    Write-Host "[*] Non-admin shell - using Scoop/MinGW (GNU) path."
    Write-Host "    To use the MSVC path instead, re-run from an elevated PowerShell."
    Install-GnuToolchain
}