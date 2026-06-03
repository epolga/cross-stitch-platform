import "dotenv/config";
import fs from "fs";
import path from "path";
import { buildHistory } from "../src/services/historyBuilder";
import type { BusinessHistory } from "../src/services/types";

// In Lambda, set REPORTS_DIR=/tmp so the file lands in writable ephemeral storage.
function getReportsDir(override?: string): string {
  return override ?? process.env.REPORTS_DIR ?? path.join(process.cwd(), "reports");
}

export async function run(reportsDir?: string): Promise<BusinessHistory> {
  const dir = getReportsDir(reportsDir);
  const history = await buildHistory();

  console.log(`\n=== Business History (${history.totalDays} days) ===\n`);
  console.log(`  Date range: ${history.dateRange.first} → ${history.dateRange.last}`);

  const { threeDay, sevenDay } = history.trends;

  if (threeDay) {
    console.log(`\n  ${threeDay.days}-day averages:`);
    console.log(`    Spend:     $${threeDay.avgSpend}`);
    console.log(`    Clicks:    ${threeDay.avgClicks}`);
    console.log(`    Sessions:  ${threeDay.avgSessions}`);
    console.log(`    Revenue:   $${threeDay.avgRevenue}`);
    console.log(`    Profit:    $${threeDay.avgProfit}`);
    console.log(`    CTR:       ${(threeDay.avgCtr * 100).toFixed(3)}%`);
    console.log(`    Rev/100s:  ${threeDay.avgRevenuePerHundredSessions !== null ? `$${threeDay.avgRevenuePerHundredSessions}` : "N/A"}`);
  }

  if (sevenDay) {
    console.log(`\n  7-day averages:`);
    console.log(`    Spend:     $${sevenDay.avgSpend}`);
    console.log(`    Clicks:    ${sevenDay.avgClicks}`);
    console.log(`    Sessions:  ${sevenDay.avgSessions}`);
    console.log(`    Revenue:   $${sevenDay.avgRevenue}`);
    console.log(`    Profit:    $${sevenDay.avgProfit}`);
  }

  if (history.directions.length > 0) {
    console.log(`\n  Trend directions:`);
    for (const d of history.directions) {
      const arrow = d.direction === "increasing" ? "↑" : d.direction === "decreasing" ? "↓" : "→";
      console.log(`    ${arrow} ${d.metric}: ${d.direction} (${d.changePercent > 0 ? "+" : ""}${d.changePercent}%)`);
    }
  }

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const outputPath = path.join(dir, "business-history.json");
  fs.writeFileSync(outputPath, JSON.stringify(history, null, 2) + "\n");
  console.log(`\n  Saved → ${outputPath}\n`);

  return history;
}

async function main() {
  await run();
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
