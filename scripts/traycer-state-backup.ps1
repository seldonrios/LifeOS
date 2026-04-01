<#
.SYNOPSIS
Creates timestamped backups of VS Code extension state with Traycer-focused defaults.

.DESCRIPTION
Backs up:
- VS Code User/globalStorage Traycer extension folders (pattern match)
- VS Code global state files used by extensions
- Optional full VS Code User/workspaceStorage (recommended for crash recovery)

Also applies retention so backups do not grow forever.
#>

[CmdletBinding()]
param(
    [string]$BackupRoot = "$env:USERPROFILE\Backups\traycer-vscode",
    [ValidateSet('Code', 'Code - Insiders', 'VSCodium')]
    [string]$Channel = 'Code',
    [string]$UserDataRoot,
    [string]$ExtensionPattern = '*traycer*',
    [ValidateSet('Full', 'Skip')]
    [string]$WorkspaceStorageMode = 'Full',
    [int]$KeepIntervalDays = 7,
    [int]$KeepDailyDays = 30
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

function Apply-Retention {
    param(
        [Parameter(Mandatory = $true)][string]$SnapshotsRoot,
        [Parameter(Mandatory = $true)][int]$IntervalDays,
        [Parameter(Mandatory = $true)][int]$DailyDays
    )

    if (-not (Test-Path $SnapshotsRoot)) {
        return
    }

    $now = Get-Date
    $recentCutoff = $now.AddDays(-$IntervalDays)
    $dailyCutoff = $now.AddDays(-$DailyDays)

    $snapshots = Get-ChildItem -Path $SnapshotsRoot -Directory | Sort-Object LastWriteTime -Descending
    if (-not $snapshots) {
        return
    }

    $keep = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

    foreach ($snapshot in $snapshots) {
        if ($snapshot.LastWriteTime -ge $recentCutoff) {
            [void]$keep.Add($snapshot.FullName)
        }
    }

    $dailyCandidates = $snapshots | Where-Object {
        $_.LastWriteTime -lt $recentCutoff -and $_.LastWriteTime -ge $dailyCutoff
    }

    $latestByDay = $dailyCandidates | Group-Object { $_.LastWriteTime.ToString('yyyy-MM-dd') }
    foreach ($group in $latestByDay) {
        $latest = $group.Group | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($latest) {
            [void]$keep.Add($latest.FullName)
        }
    }

    foreach ($snapshot in $snapshots) {
        if (-not $keep.Contains($snapshot.FullName)) {
            Remove-Item -Path $snapshot.FullName -Recurse -Force
        }
    }
}

$userRoot = Resolve-UserDataRoot -ChannelName $Channel -ExplicitRoot $UserDataRoot
$globalStorage = Join-Path $userRoot 'globalStorage'
$workspaceStorage = Join-Path $userRoot 'workspaceStorage'

if (-not (Test-Path $globalStorage)) {
    throw "VS Code globalStorage path not found: $globalStorage"
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$snapshotRoot = Join-Path $BackupRoot 'snapshots'
$snapshotDir = Join-Path $snapshotRoot $timestamp

New-Item -Path $snapshotDir -ItemType Directory -Force | Out-Null
New-Item -Path (Join-Path $snapshotDir 'globalStorage') -ItemType Directory -Force | Out-Null

$traycerFolders = Get-ChildItem -Path $globalStorage -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like $ExtensionPattern }

foreach ($folder in $traycerFolders) {
    $dest = Join-Path (Join-Path $snapshotDir 'globalStorage') $folder.Name
    Invoke-RobocopySafe -Source $folder.FullName -Destination $dest
}

Copy-IfExists -Source (Join-Path $globalStorage 'state.vscdb') -Destination (Join-Path (Join-Path $snapshotDir 'globalStorage') 'state.vscdb')
Copy-IfExists -Source (Join-Path $globalStorage 'state.vscdb.backup') -Destination (Join-Path (Join-Path $snapshotDir 'globalStorage') 'state.vscdb.backup')
Copy-IfExists -Source (Join-Path $globalStorage 'storage.json') -Destination (Join-Path (Join-Path $snapshotDir 'globalStorage') 'storage.json')

if ($WorkspaceStorageMode -eq 'Full') {
    $workspaceDest = Join-Path $snapshotDir 'workspaceStorage'
    Invoke-RobocopySafe -Source $workspaceStorage -Destination $workspaceDest
}

$manifest = [ordered]@{
    createdAt = (Get-Date).ToString('o')
    machine = $env:COMPUTERNAME
    channel = $Channel
    userDataRoot = $userRoot
    extensionPattern = $ExtensionPattern
    workspaceStorageMode = $WorkspaceStorageMode
    traycerFolderCount = @($traycerFolders).Count
    traycerFolders = @($traycerFolders | Select-Object -ExpandProperty Name)
    snapshotDir = $snapshotDir
}

$manifestPath = Join-Path $snapshotDir 'manifest.json'
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8

Apply-Retention -SnapshotsRoot $snapshotRoot -IntervalDays $KeepIntervalDays -DailyDays $KeepDailyDays

Write-Host "Backup created: $snapshotDir" -ForegroundColor Green
Write-Host "Matched Traycer folders: $(@($traycerFolders).Count)" -ForegroundColor Green
