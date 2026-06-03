@echo off
cd /d D:\ann\Git\cross-stitch-platform\automation\pinterest-agent

echo [%date% %time%] Starting daily business pipeline >> daily-run.log

call npm run daily >> daily-run.log 2>&1
if errorlevel 1 (
    echo [%date% %time%] ERROR: daily report failed >> daily-run.log
    exit /b 1
)

call npm run history >> daily-run.log 2>&1
if errorlevel 1 (
    echo [%date% %time%] ERROR: history build failed >> daily-run.log
    exit /b 1
)

call npm run anomaly >> daily-run.log 2>&1
if errorlevel 1 (
    echo [%date% %time%] ERROR: anomaly detection failed >> daily-run.log
    exit /b 1
)

call npm run notify >> daily-run.log 2>&1
if errorlevel 1 (
    echo [%date% %time%] ERROR: anomaly notifier failed >> daily-run.log
    exit /b 1
)

call npm run ai:trend >> daily-run.log 2>&1
if errorlevel 1 (
    echo [%date% %time%] ERROR: ai trend analysis failed >> daily-run.log
    exit /b 1
)

call npm run pinmap >> daily-run.log 2>&1
if errorlevel 1 (
    echo [%date% %time%] ERROR: design-pin map export failed >> daily-run.log
    exit /b 1
)

call npm run perf >> daily-run.log 2>&1
if errorlevel 1 (
    echo [%date% %time%] ERROR: design performance build failed >> daily-run.log
    exit /b 1
)

call npm run ai:design >> daily-run.log 2>&1
if errorlevel 1 (
    echo [%date% %time%] ERROR: ai design analysis failed >> daily-run.log
    exit /b 1
)

call npm run summary >> daily-run.log 2>&1
if errorlevel 1 (
    echo [%date% %time%] ERROR: daily summary email failed >> daily-run.log
    exit /b 1
)

echo [%date% %time%] Pipeline complete >> daily-run.log
