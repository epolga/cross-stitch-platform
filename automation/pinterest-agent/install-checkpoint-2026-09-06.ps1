# One-shot installer for the 2026-09-06 checkpoint reminder — runs
# checkpoint-2026-09-06.ts (gathers real data for Focus.md Open items
# #7/#26/#27/#28 and the two IPs watched 2026-09-03) and emails the digest
# to Olga via the existing sesClient.ts, so nothing needs to be remembered.
#
# Same pattern as install-google-token-refresh-reminder.ps1, but a ONE-TIME
# trigger (auto-deletes itself after firing) rather than weekly.
#
# Run once:
#   powershell -ExecutionPolicy Bypass -File .\install-checkpoint-2026-09-06.ps1
#
# To remove before it fires:
#   schtasks /Delete /TN Checkpoint20260906 /F

$taskName    = "Checkpoint20260906"
$repoDir     = "D:\ann\Git\cross-stitch-platform\automation\pinterest-agent"
$scriptPath  = Join-Path $repoDir "scripts\checkpoint-2026-09-06.ts"

if (-not (Test-Path $scriptPath)) {
    Write-Error "Checkpoint script not found at $scriptPath"
    exit 1
}

# -WindowStyle Hidden so this doesn't flash a console at 9am — the whole
# point is Olga doesn't have to notice or do anything, just get the email.
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"Set-Location '$repoDir'; npx tsx scripts\checkpoint-2026-09-06.ts *> checkpoint-2026-09-06.log`""

# One-time trigger. -StartWhenAvailable means if the machine is off/asleep
# at 9am on the day, it fires as soon as it's next on instead of silently
# never firing — the whole reason this exists is so Olga doesn't have to
# remember, so a missed silent fire would defeat the purpose.
$trigger = New-ScheduledTaskTrigger -Once -At "2026-09-06T09:00:00"

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable

$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

# Idempotent: replace if it already exists (e.g. re-running after editing
# the checkpoint script).
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "One-shot 2026-09-06 checkpoint: runs checkpoint-2026-09-06.ts and emails the data digest for Focus.md Open items #7/#26/#27/#28 and the 2026-09-03 IP watch. Self-deletes after firing."

Write-Output ""
Write-Output "Installed scheduled task '$taskName'"
Write-Output "  Trigger:  Once, 2026-09-06 09:00 local (fires late if the PC was off)"
Write-Output "  Action:   npx tsx scripts\checkpoint-2026-09-06.ts (in $repoDir)"
Write-Output "  Log:      $repoDir\checkpoint-2026-09-06.log"
Write-Output ""
Write-Output "To run it right now instead of waiting:"
Write-Output "  Start-ScheduledTask -TaskName $taskName"
Write-Output ""
Write-Output "To preview the underlying script without waiting for the task (this WILL send a real email):"
Write-Output "  npx tsx scripts\checkpoint-2026-09-06.ts"
