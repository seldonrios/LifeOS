@echo off
REM ================================
REM Traycer Git Commit Script
REM Available environment variables:
REM   %%COMMIT_MESSAGE%% - Generated commit message
REM   %%PHASE_TITLE%% - Phase title
REM   %%PHASE_ID%% - Phase ID
REM   %%WORKSPACE_PATH%% - Workspace root path
REM ================================
setlocal EnableExtensions

if "%WORKSPACE_PATH%"=="" (
    echo ERROR: WORKSPACE_PATH is empty.
    exit /b 1
)

cd /d "%WORKSPACE_PATH%"
if errorlevel 1 (
    echo ERROR: Could not change directory to WORKSPACE_PATH: %WORKSPACE_PATH%
    exit /b 1
)

if "%COMMIT_MESSAGE%"=="" (
    echo ERROR: COMMIT_MESSAGE is empty.
    exit /b 1
)

REM Normalize commit message to conventional format and write to temp file
set "TRAYCER_MSG_FILE=%TEMP%\traycer_commit_msg_%PHASE_ID%.txt"
powershell -NoProfile -Command "$raw = $env:COMMIT_MESSAGE; if ([string]::IsNullOrWhiteSpace($raw)) { exit 2 }; $first = ($raw -split '\r?\n')[0].Trim(); $match = [regex]::Match($first, '^((?<type>build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([^)]+\))?!?):\s+(.+)$'); if ($match.Success) { $type = $match.Groups['type'].Value.ToLowerInvariant(); $prefix = $match.Groups[1].Value; $subject = $match.Groups[4].Value.Trim(); if (@('feat','fix','docs','chore','refactor','test','build','ci') -notcontains $type) { $prefix = 'chore' } } else { $prefix = 'chore'; $subject = $first }; $subject = $subject.ToLowerInvariant(); $normalized = $prefix + ': ' + $subject; [System.IO.File]::WriteAllText($env:TRAYCER_MSG_FILE, $normalized, [System.Text.UTF8Encoding]::new($false))"
if errorlevel 1 (
    echo ERROR: PowerShell failed to write commit message to temp file: %TRAYCER_MSG_FILE%
    exit /b 1
)
if not exist "%TRAYCER_MSG_FILE%" (
    echo ERROR: Commit message file was not created: %TRAYCER_MSG_FILE%
    exit /b 1
)
for %%A in ("%TRAYCER_MSG_FILE%") do if %%~zA EQU 0 (
    echo ERROR: Commit message file is empty: %TRAYCER_MSG_FILE%
    del /f /q "%TRAYCER_MSG_FILE%" >nul 2>&1
    exit /b 1
)

REM Single-attempt flow to avoid repeated long hook runs in automation
echo Commit attempt 1 of 1...

call git -c core.autocrlf=false add -A
if errorlevel 1 (
    set "EXIT_CODE=%ERRORLEVEL%"
    goto :done
)

call git diff --cached --quiet
if not errorlevel 1 (
    echo No staged changes to commit.
    goto :success
)

echo Running commit with hooks enabled to enforce repository restrictions.
set "TRAYCER_GIT_AUTOMATION=1"
call git commit -F "%TRAYCER_MSG_FILE%"
set "EXIT_CODE=%ERRORLEVEL%"

if %EXIT_CODE% EQU 0 goto :success
goto :done

:success
del /f /q "%TRAYCER_MSG_FILE%" >nul 2>&1
exit /b 0

:done
del /f /q "%TRAYCER_MSG_FILE%" >nul 2>&1
echo ERROR: Commit failed. Exit code: %EXIT_CODE%
exit /b %EXIT_CODE%
