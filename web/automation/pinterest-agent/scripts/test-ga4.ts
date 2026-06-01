import "dotenv/config";
import { getGA4PinterestSessions } from "../src/services/googleAnalytics";

async function main() {
  const result = await getGA4PinterestSessions();

  if (result.total === 0) {
    console.log("No Pinterest sessions found yesterday.");
    return;
  }

  console.log("Yesterday's Pinterest sessions:\n");
  console.log(`  Paid Social: ${result.paidSocial}`);
  console.log(`  Organic:     ${result.organic}`);
  console.log(`  Referral:    ${result.referral}`);
  console.log(`  Total:       ${result.total}`);
}

main().catch((err) => {
  console.error("Error fetching GA4 data:", err.message || err);
  process.exit(1);
});
