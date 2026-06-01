import "dotenv/config";
import { notifyAnomalies } from "../src/services/anomalyNotifier";

(async () => {
  console.log("=== Anomaly notifier ===");
  const result = await notifyAnomalies();

  if (result.unnotifiedFound === 0) {
    console.log("  No unnotified ANOMALY_EVENT rows. Nothing to send.");
    return;
  }

  console.log(`  Found ${result.unnotifiedFound} unnotified row(s).`);
  console.log(`  Email sent. MessageId=${result.sentMessageId}`);
  console.log(`  Marked notified: ${result.marked}/${result.unnotifiedFound}`);

  if (result.markFailures.length > 0) {
    console.error(`  ${result.markFailures.length} mark-notified failures:`);
    for (const f of result.markFailures) {
      console.error(`    ${f.detectedAt}#${f.metric}: ${f.error}`);
    }
    // Don't fail the cron just for stamping — the email was sent.
    // The unmarked rows will resend on the next run, which is preferable
    // to silently dropping the alert.
    process.exitCode = 1;
  }
})().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
