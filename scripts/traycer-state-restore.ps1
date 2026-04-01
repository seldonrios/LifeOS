<#
.SYNOPSIS
Restores VS Code extension state from a Traycer backup snapshot.

.DESCRIPTION
- Requires VS Code to be closed unless -ForceWhileCodeRunning is set.
- Creates a safety backup of current state before restore.
- Restores Traycer globalStorage folders and global state files.
- Optional full workspaceStorage restore.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$BackupRoot = "$env:USERPROFILE\Backups\traycer-vscode",
    [string]$Snapshot,
    [ValidateSet('Code', 'Code - Insiders', 'VSCodium')]
    [string]$Channel = 'Code',
    [string]$UserDataRoot,
    [string]$ExtensionPattern = '*traycer*',
    [ValidateSet('Full', 'Skip')]
    [string]$WorkspaceStorageMode = 'Full',
    [switch]$ForceWhileCodeRunning
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-UserDataRoot {
    param([string]$ChannelName, [string]$ExplicitRoot)

    if ($ExplicitRoot) {
        return $ExplicitRoot
    }

    switch ($ChannelName) {
        'Code' { return Join-Path $env:APPDATA 'Code\User' }
        'Code - Insiders' { return Join-Path $env:APPDATA 'Code - Insiders\User' }
        'VSCodium' { return Join-Path $env:APPDATA 'VSCodium\User' }
        default { throw "Unsupported channel: $ChannelName" }
    }
}

function Invoke-RobocopySafe {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination,
        [switch]$Mirror
    )

    if (-not (Test-Path $Source)) {
        return
    }

    New-Item -Path $Destination -ItemType Directory -Force | Out-Null

    $args = @(
        $Source,
        $Destination,
        '/E',
        '/COPY:DAT',
        '/R:1',
        '/W:1',
        '/NFL',
        '/NDL',
        '/NJH',
        '/NJS',
        '/NP'
    )

    if ($Mirror) {
        $args += '/MIR'
    }

    & robocopy @args | Out-Null
    $exitCode = $LASTEXITCODE
    if ($exitCode -gt 7) {
        throw "robocopy failed with exit code $exitCode for '$Source'"
    }
}

function Copy-IfExists {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    if (Test-Path $Source) {
        New-Item -Path (Split-Path $Destination -Parent) -ItemType Directory -Force | Out-Null
        Copy-Item -Path $Source -Destination $Destination -Force
    }
}

$snapshotsRoot = Join-Path $BackupRoot 'snapshots'
if (-not (Test-Path $snapshotsRoot)) {
    throw "No snapshots found under: $snapshotsRoot"
}

$runningCode = Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'Code*' -or $_.Name -like 'VSCodium*' }
if ($runningCode -and -not $ForceWhileCodeRunning) {
    throw 'VS Code appears to be running. Close it first, or rerun with -ForceWhileCodeRunning.'
}

if ($Snapshot) {
    $snapshotPath = Join-Path $snapshotsRoot $Snapshot
} else {
    $latest = Get-ChildItem -Path $snapshotsRoot -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latest) {
        throw "No snapshot directories found under: $snapshotsRoot"
    }
    $snapshotPath = $latest.FullName
}

if (-not (Test-Path $snapshotPath)) {
    throw "Snapshot not found: $snapshotPath"
}

$userRoot = Resolve-UserDataRoot -ChannelName $Channel -ExplicitRoot $UserDataRoot
$globalStorage = Join-Path $userRoot 'globalStorage'
$workspaceStorage = Join-Path $userRoot 'workspaceStorage'

if (-not (Test-Path $globalStorage)) {
    throw "VS Code globalStorage path not found: $globalStorage"
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$safetyRoot = Join-Path $BackupRoot 'pre-restore'
$safetyPath = Join-Path $safetyRoot $timestamp

if ($PSCmdlet.ShouldProcess($userRoot, 'Restore Traycer VS Code state')) {
    New-Item -Path $safetyPath -ItemType Directory -Force | Out-Null
    New-Item -Path (Join-Path $safetyPath 'globalStorage') -ItemType Directory -Force | Out-Null

    # Safety backup before writing anything.
    $existingTraycerFolders = Get-ChildItem -Path $globalStorage -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like $ExtensionPattern }
    foreach ($folder in $existingTraycerFolders) {
        $dest = Join-Path (Join-Path $safetyPath 'globalStorage') $folder.Name
        Invoke-RobocopySafe -Source $folder.FullName -Destination $dest
    }

    Copy-IfExists -Source (Join-Path $globalStorage 'state.vscdb') -Destination (Join-Path (Join-Path $safetyPath 'globalStorage') 'state.vscdb')
    Copy-IfExists -Source (Join-Path $globalStorage 'state.vscdb.backup') -Destination (Join-Path (Join-Path $safetyPath 'globalStorage') 'state.vscdb.backup')
    Copy-IfExists -Source (Join-Path $globalStorage 'storage.json') -Destination (Join-Path (Join-Path $safetyPath 'globalStorage') 'storage.json')

    if ($WorkspaceStorageMode -eq 'Full' -and (Test-Path $workspaceStorage)) {
        Invoke-RobocopySafe -Source $workspaceStorage -Destination (Join-Path $safetyPath 'workspaceStorage')
    }

    $snapshotGlobal = Join-Path $snapshotPath 'globalStorage'
    if (-not (Test-Path $snapshotGlobal)) {
        throw "Snapshot is missing globalStorage data: $snapshotGlobal"
    }

    # Remove current Traycer folders and copy snapshot folders.
    Get-ChildItem -Path $globalStorage -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like $ExtensionPattern } |
        ForEach-Object { Remove-Item -Path $_.FullName -Recurse -Force }

    $snapshotTraycer = Get-ChildItem -Path $snapshotGlobal -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like $ExtensionPattern }

    foreach ($folder in $snapshotTraycer) {
        $dest = Join-Path $globalStorage $folder.Name
        Invoke-RobocopySafe -Source $folder.FullName -Destination $dest
    }

    Copy-IfExists -Source (Join-Path $snapshotGlobal 'state.vscdb') -Destination (Join-Path $globalStorage 'state.vscdb')
    Copy-IfExists -Source (Join-Path $snapshotGlobal 'state.vscdb.backup') -Destination (Join-Path $globalStorage 'state.vscdb.backup')
    Copy-IfExists -Source (Join-Path $snapshotGlobal 'storage.json') -Destination (Join-Path $globalStorage 'storage.json')

    if ($WorkspaceStorageMode -eq 'Full') {
        $snapshotWorkspace = Join-Path $snapshotPath 'workspaceStorage'
        if (-not (Test-Path $snapshotWorkspace)) {
            throw "Snapshot is missing workspaceStorage data: $snapshotWorkspace"
        }
        Invoke-RobocopySafe -Source $snapshotWorkspace -Destination $workspaceStorage -Mirror
    }

    Write-Host "Restore complete from snapshot: $snapshotPath" -ForegroundColor Green
    Write-Host "Safety backup created at: $safetyPath" -ForegroundColor Green
}
