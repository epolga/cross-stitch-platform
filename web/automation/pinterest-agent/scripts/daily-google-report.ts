import "dotenv/config";
import fs from "fs";
import path from "path";
import { formatDate, yesterdayDate } from "../src/services/dateUtils";
import { getGA4PinterestSessions, getAdSenseEarnings } from "../src/services/googleAnalytics";
import type { GA4PinterestSessions } from "../src/services/types";

interface DailyGoogleReport {
  date: string;
  pinterest: GA4PinterestSessions;
  adsense: { estimatedEarnings: number };
  derived: { revenuePerHundredPinterestSessions: number | null };
}

async function main() {
  const [pinterest, earnings] = await Promise.all([
    getGA4PinterestSessions(),
    getAdSenseEarnings(),
  ]);

  const dateStr = formatDate(yesterdayDate());

  const revPer100 =
    pinterest.total > 0
      ? Math.round(((earnings / pinterest.total) * 100) * 100) / 100
      : null;

  const report: DailyGoogleReport = {
    date: dateStr,
    pinterest,
    adsense: { estimatedEarnings: earnings },
    derived: { revenuePerHundredPinterestSessions: revPer100 },
  };

  // Print report
  console.log(`\n=== Daily Google Report (${dateStr}) ===\n`);
  console.log(`  Pinterest PaidSocial sessions:  ${pinterest.paidSocial}`);
  console.log(`  Pinterest organic sessions:     ${pinterest.organic}`);
  console.log(`  Pinterest referral sessions:    ${pinterest.referral}`);
  console.log(`  Total Pinterest sessions:       ${pinterest.total}`);
  console.log(`  AdSense estimated earnings:     $${earnings.toFixed(2)}`);
  console.log(
    `  Est. revenue / 100 sessions:   ${revPer100 !== null ? `$${revPer100.toFixed(2)}` : "N/A"}`
  );
  console.log();

  // Save JSON report
  const reportsDir = path.join(process.cwd(), "reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const reportPath = path.join(reportsDir, `${dateStr}-google-report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`  Saved → ${reportPath}\n`);
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
