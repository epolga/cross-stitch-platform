import "dotenv/config";
import { adsense } from "../src/services/googleClient";
import { yesterdayDate, formatDate } from "../src/services/dateUtils";

async function main() {
  const accountsResponse = await adsense.accounts.list();
  const accounts = accountsResponse.data.accounts || [];

  if (accounts.length === 0) {
    console.error("No AdSense accounts found.");
    process.exit(1);
  }

  const accountName = accounts[0].name!;
  console.log(`AdSense account: ${accountName}\n`);

  const yesterday = yesterdayDate();

  const dateStr = formatDate(yesterday);

  const report = await adsense.accounts.reports.generate({
    account: accountName,
    "startDate.year": yesterday.getFullYear(),
    "startDate.month": yesterday.getMonth() + 1,
    "startDate.day": yesterday.getDate(),
    "endDate.year": yesterday.getFullYear(),
    "endDate.month": yesterday.getMonth() + 1,
    "endDate.day": yesterday.getDate(),
    metrics: [
      "ESTIMATED_EARNINGS",
      "PAGE_VIEWS",
      "IMPRESSIONS",
      "CLICKS",
    ],
    reportingTimeZone: "ACCOUNT_TIME_ZONE",
  });

  const rows = report.data.rows || [];
  const totals = report.data.totals;

  console.log(`AdSense report for ${dateStr}:\n`);

  if (totals?.cells) {
    const earnings = totals.cells[0]?.value ?? "N/A";
    const pageViews = totals.cells[1]?.value ?? "N/A";
    const impressions = totals.cells[2]?.value ?? "N/A";
    const clicks = totals.cells[3]?.value ?? "N/A";

    console.log(`  Estimated Earnings: $${earnings}`);
    console.log(`  Page Views:         ${pageViews}`);
    console.log(`  Impressions:        ${impressions}`);
    console.log(`  Clicks:             ${clicks}`);
  } else {
    console.log("  No data available for yesterday.");
  }
}

main().catch((err) => {
  console.error("Error fetching AdSense data:", err.message || err);
  process.exit(1);
});
