<#
.SYNOPSIS
Registers a Scheduled Task that snapshots VS Code Traycer state on an interval.
#>

[CmdletBinding()]
param(
    [string]$TaskName = 'LifeOS-Traycer-State-Backup',
    [int]$IntervalMinutes = 10,
    [string]$BackupRoot = "$env:USERPROFILE\Backups\traycer-vscode",
    [ValidateSet('Code', 'Code - Insiders', 'VSCodium')]
    [string]$Channel = 'Code',
    [string]$ExtensionPattern = '*traycer*',
    [ValidateSet('Full', 'Skip')]
    [string]$WorkspaceStorageMode = 'Full',
    [int]$KeepIntervalDays = 7,
    [int]$KeepDailyDays = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($IntervalMinutes -lt 5) {
    throw 'IntervalMinutes must be 5 or greater.'
}

$scriptPath = Join-Path $PSScriptRoot 'traycer-state-backup.ps1'
if (-not (Test-Path $scriptPath)) {
    throw "Backup script not found: $scriptPath"
}

$defaultBackupRoot = "$env:USERPROFILE\Backups\traycer-vscode"
$argList = @(
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    ('"{0}"' -f $scriptPath)
)

if ($BackupRoot -ne $defaultBackupRoot) {
    $argList += @('-BackupRoot', ('"{0}"' -f $BackupRoot))
}
if ($Channel -ne 'Code') {
    $argList += @('-Channel', ('"{0}"' -f $Channel))
}
if ($ExtensionPattern -ne '*traycer*') {
    $argList += @('-ExtensionPattern', ('"{0}"' -f $ExtensionPattern))
}
if ($WorkspaceStorageMode -ne 'Full') {
    $argList += @('-WorkspaceStorageMode', ('"{0}"' -f $WorkspaceStorageMode))
}
if ($KeepIntervalDays -ne 7) {
    $argList += @('-KeepIntervalDays', $KeepIntervalDays)
}
if ($KeepDailyDays -ne 30) {
    $argList += @('-KeepDailyDays', $KeepDailyDays)
}

$argString = $argList -join ' '

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argString
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Scheduled task registered: $TaskName" -ForegroundColor Green
Write-Host "Runs every $IntervalMinutes minutes while logged in." -ForegroundColor Green
