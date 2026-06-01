// Smoke test for SES wiring: sends a one-shot email to SES_RECIPIENT and
// prints the MessageId. Useful when bootstrapping a new env, verifying
// IAM permissions, or after rotating credentials. Not part of daily-run.bat.

import "dotenv/config";
import { sendEmail } from "../src/services/sesClient";

(async () => {
  const stamp = new Date().toISOString();
  const result = await sendEmail({
    subject: `[cross-stitch agent] SES test ${stamp}`,
    textBody:
      `This is a test email from the pinterest-agent SES wiring.\n\n` +
      `Timestamp: ${stamp}\n` +
      `Sender:    ${process.env.SES_SENDER}\n` +
      `Recipient: ${process.env.SES_RECIPIENT}\n` +
      `Configuration set: ${process.env.SES_CONFIGURATION_SET ?? "(none)"}\n`,
  });
  console.log(`Sent. MessageId=${result.messageId}`);
})().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
