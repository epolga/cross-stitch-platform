# Weekly reminder to refresh the Google OAuth refresh token used by the
# pinterest-agent cron (daily-business-report.ts → googleClient.ts).
#
# Google's OAuth consent screen is currently in "Testing" status, which
# caps refresh tokens at a 7-day lifetime. This popup fires on day 6 so
# the token is renewed before it expires and the cron never fails with
# `Error: invalid_grant`.
#
# Scheduled by install-google-token-refresh-reminder.ps1 — that creates
# the "GoogleTokenRefreshReminder" Windows scheduled task pointing at
# this file.

Add-Type -AssemblyName System.Windows.Forms

$message  = "Google OAuth refresh token expires in ~1 day."
$message += "`n`nRefresh now? A browser tab will open for the Google"
$message += "`nconsent screen. Sign in and approve — the new token is"
$message += "`nwritten to .env automatically. Takes ~20 seconds."

$result = [System.Windows.Forms.MessageBox]::Show(
    $message,
    "Cross-stitch Agent: Google Token Refresh Due",
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Warning,
    [System.Windows.Forms.MessageBoxDefaultButton]::Button1
)

if ($result -eq [System.Windows.Forms.DialogResult]::Yes) {
    $agentDir = "D:\ann\Git\cross-stitch\automation\pinterest-agent"
    # -NoExit so the user sees the success message ("New refresh token:" +
    # ".env updated") before the window closes.
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "Set-Location '$agentDir'; npx tsx scripts\get-google-refresh-token.ts"
    )
}
