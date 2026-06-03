import "dotenv/config";
import { sendDailySummary } from "../src/services/dailySummary";

(async () => {
  const { messageId, date } = await sendDailySummary();
  console.log(`  Daily summary sent → SES MessageId=${messageId}  (date=${date})\n`);
})().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
