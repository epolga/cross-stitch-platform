import "dotenv/config";
import { getGA4PinterestSessions, getAdSenseEarnings } from "../src/services/googleAnalytics";
import { yesterdayDateStr } from "../src/services/dateUtils";

async function main() {
  const [ga4Sessions, adSenseEarnings] = await Promise.all([
    getGA4PinterestSessions(),
    getAdSenseEarnings(),
  ]);

  const dateStr = yesterdayDateStr();

  console.log(`\n=== Pinterest ↔ AdSense Report (${dateStr}) ===\n`);
  console.log(`  Pinterest sessions:          ${ga4Sessions.total}`);
  console.log(`  AdSense estimated earnings:  $${adSenseEarnings.toFixed(2)}`);

  if (ga4Sessions.total > 0) {
    const revPer100 = (adSenseEarnings / ga4Sessions.total) * 100;
    console.log(`  Est. revenue per 100 sessions: $${revPer100.toFixed(2)}`);
  } else {
    console.log(`  Est. revenue per 100 sessions: N/A (no Pinterest sessions)`);
  }

  console.log();
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
