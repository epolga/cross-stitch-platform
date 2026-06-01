# One-shot installer for the weekly Google-token-refresh popup reminder.
#
# Creates (or replaces) the Windows scheduled task
# "GoogleTokenRefreshReminder" that fires google-token-refresh-popup.ps1
# every Saturday at 9:00 AM. Saturday is chosen as day 6 of the 7-day
# Testing-mode refresh-token window — gives a full day of buffer before
# the cron's Sunday tick would otherwise fail with `invalid_grant`.
#
# Run once (or after editing the popup script):
#   powershell -ExecutionPolicy Bypass -File .\install-google-token-refresh-reminder.ps1
#
# To remove:
#   schtasks /Delete /TN GoogleTokenRefreshReminder /F

$taskName  = "GoogleTokenRefreshReminder"
$popupPath = "D:\ann\Git\cross-stitch\automation\pinterest-agent\google-token-refresh-popup.ps1"

if (-not (Test-Path $popupPath)) {
    Write-Error "Popup script not found at $popupPath"
    exit 1
}

# -WindowStyle Hidden so the task host doesn't flash a console — the
# MessageBox itself is the only thing the user should see.
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$popupPath`""

$trigger = New-ScheduledTaskTrigger `
    -Weekly `
    -DaysOfWeek Saturday `
    -At 9:00am

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable

$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

# Idempotent: replace if it already exists.
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Weekly popup reminding the user to refresh GOOGLE_REFRESH_TOKEN before the 7-day Testing-mode expiry. See ../../docs (or memory: google-oauth-testing-7day-expiry) for context."

Write-Output ""
Write-Output "Installed scheduled task '$taskName'"
Write-Output "  Trigger:  Weekly, Saturday 09:00"
Write-Output "  Action:   $popupPath"
Write-Output ""
Write-Output "To preview the popup now, run:"
Write-Output "  powershell -ExecutionPolicy Bypass -File `"$popupPath`""
