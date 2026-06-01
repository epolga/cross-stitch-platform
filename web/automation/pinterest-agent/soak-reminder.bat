@echo off
REM Fired daily by the Windows scheduled task MilestoneFiveSoakReminder
REM (created 2026-05-23, triggers daily at 8:57 AM starting 2026-05-30).
REM Appends a marker line to daily-run.log so the morning log review surfaces
REM the day-7+ soak-window check. Delete the scheduled task and this file
REM after the Milestone 5 cutover lands — both are listed in SOAK-WINDOW.md's
REM cutover checklist.

set LOGFILE=D:\ann\Git\cross-stitch\automation\pinterest-agent\daily-run.log
echo [%date% %time%] === SOAK CHECK DUE - REVIEW SOAK-WINDOW.md === >> "%LOGFILE%"
