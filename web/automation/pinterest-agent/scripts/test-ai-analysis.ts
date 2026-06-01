import "dotenv/config";
import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { yesterdayDateStr } from "../src/services/dateUtils";
import type { BusinessReport } from "../src/services/types";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey || apiKey === "your-key-here") {
  console.error("Set ANTHROPIC_API_KEY in .env");
  process.exit(1);
}

async function main() {
  const dateStr = yesterdayDateStr();
  const reportPath = path.join(process.cwd(), "reports", `${dateStr}-business-report.json`);

  if (!fs.existsSync(reportPath)) {
    console.error(`Report not found: ${reportPath}`);
    console.error("Run daily-business-report.ts first.");
    process.exit(1);
  }

  const report: BusinessReport = JSON.parse(fs.readFileSync(reportPath, "utf-8"));

  const summary = {
    date: report.date,
    pinterestSpend: report.pinterestAds.spend,
    pinterestClicks: report.pinterestAds.clicks,
    pinterestOutboundClicks: report.pinterestAds.outboundClicks,
    ga4PinterestSessions: report.ga4PinterestSessions.total,
    ga4PaidSessions: report.ga4PinterestSessions.paidSocial,
    ga4OrganicSessions: report.ga4PinterestSessions.organic,
    adsenseRevenue: report.adsense.estimatedEarnings,
    revenuePerHundredSessions: report.derived.revenuePerHundredPinterestSessions,
    profitEstimate: report.derived.roughProfitEstimate,
  };

  const prompt = `Analyze this Pinterest marketing performance report for a cross-stitch pattern website.

${JSON.stringify(summary, null, 2)}

Provide:
1. Key observations
2. Potential risks
3. Suggested next actions
4. Whether ad spend should increase, decrease, or stay stable

Keep response concise and practical.`;

  console.log(`\n=== AI Analysis for ${dateStr} ===\n`);

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  console.log(text);
  console.log();
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
