// Sends a Telegram reminder on Saturdays to refresh the Google OAuth token.
// Google OAuth "Testing" tokens expire after 7 days; this fires on day 6
// so the token is renewed before it expires and the pipeline never fails
// with invalid_grant.

import { sendTelegramMessage } from "./telegramClient";

export async function sendGoogleTokenReminderIfDue(): Promise<boolean> {
  const day = new Date().getUTCDay(); // 0=Sun … 6=Sat
  if (day !== 6) return false;

  const msg = [
    "🔑 <b>Google OAuth token refresh due</b>",
    "",
    "Run on your computer:",
    "<code>cd automation/pinterest-agent",
    "npm run setup-token</code>",
    "",
    "Then push the new token to Lambda:",
    "<code>.\\lambda\\push-google-token.ps1</code>",
  ].join("\n");

  await sendTelegramMessage(msg);
  return true;
}
