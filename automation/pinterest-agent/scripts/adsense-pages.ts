import "dotenv/config";
import { adsense } from "../src/services/googleClient";

async function main() {
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo   = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);

  const accountsRes = await adsense.accounts.list();
  const account = accountsRes.data.accounts![0].name!;

  const report = await adsense.accounts.reports.generate({
    account,
    "startDate.year":  weekAgo.getFullYear(),
    "startDate.month": weekAgo.getMonth() + 1,
    "startDate.day":   weekAgo.getDate(),
    "endDate.year":    yesterday.getFullYear(),
    "endDate.month":   yesterday.getMonth() + 1,
    "endDate.day":     yesterday.getDate(),
    dimensions: ["PAGE_URL"],
    metrics: ["ESTIMATED_EARNINGS", "PAGE_VIEWS", "PAGE_VIEWS_RPM", "IMPRESSIONS"],
    orderBy: ["-ESTIMATED_EARNINGS"],
    limit: 25,
  });

  // Print headers to verify column order
  const headers = report.data.headers?.map(h => h.name) ?? [];
  console.log("Columns:", headers.join(", "), "\n");

  // Dimension PAGE_URL is first (c[0]), then metrics in declared order
  const iUrl  = headers.indexOf("PAGE_URL");
  const iEarn = headers.indexOf("ESTIMATED_EARNINGS");
  const iView = headers.indexOf("PAGE_VIEWS");
  const iRpm  = headers.indexOf("PAGE_VIEWS_RPM");

  console.log("Top 25 pages by earnings (last 7 days)\n");
  console.log("earnings |   rpm | views | url");
  console.log("---------|-------|-------|----");
  for (const row of report.data.rows ?? []) {
    const c    = row.cells!;
    const earn = parseFloat(c[iEarn].value!).toFixed(3).padStart(8);
    const views = String(c[iView].value).padStart(5);
    const rpm  = parseFloat(c[iRpm].value!).toFixed(2).padStart(6);
    const url  = (c[iUrl].value ?? "").replace("https://cross-stitch.com", "");
    console.log(`$${earn} | $${rpm} | ${views} | ${url}`);
  }

  const totals = report.data.totals?.cells;
  if (totals) {
    console.log(`\nTotal: earnings=$${parseFloat(totals[0].value!).toFixed(2)} views=${totals[1].value} rpm=$${parseFloat(totals[2].value!).toFixed(2)}`);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
