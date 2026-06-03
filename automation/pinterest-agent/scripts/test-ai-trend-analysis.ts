import "dotenv/config";
import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { yesterdayDateStr } from "../src/services/dateUtils";
import type { BusinessHistory } from "../src/services/types";
import { putMarkdown } from "../src/services/aiArtifactStore";
import { putAiAnalysis } from "../src/services/historyStore";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey || apiKey === "your-key-here") {
  console.error("Set ANTHROPIC_API_KEY in .env");
  process.exit(1);
}

function getReportsDir(override?: string): string {
  return override ?? process.env.REPORTS_DIR ?? path.join(process.cwd(), "reports");
}

export async function run(reportsDir?: string): Promise<void> {
  const dir = getReportsDir(reportsDir);
  const historyPath = path.join(dir, "business-history.json");

  if (!fs.existsSync(historyPath)) {
    throw new Error(`business-history.json not found at ${historyPath}. Run build-business-history first.`);
  }

  const history: BusinessHistory = JSON.parse(fs.readFileSync(historyPath, "utf-8"));

  if (history.totalDays < 2) {
    throw new Error("Need at least 2 days of data for trend analysis.");
  }

  const summary = {
    totalDays: history.totalDays,
    dateRange: history.dateRange,
    dailyMetrics: history.dailyMetrics.map((d) => ({
      date: d.date,
      spend: d.spend,
      clicks: d.clicks,
      outboundClicks: d.outboundClicks,
      sessions: d.ga4Sessions,
      paidSessions: d.ga4PaidSessions,
      organicSessions: d.ga4OrganicSessions,
      revenue: d.adsenseRevenue,
      revPer100Sessions: d.revenuePerHundredSessions,
      profit: d.profit,
    })),
    trends: history.trends,
    directions: history.directions,
  };

  const prompt = `You are a marketing analytics agent for a cross-stitch pattern website that monetizes through AdSense.

Analyze this multi-day Pinterest advertising performance history:

${JSON.stringify(summary, null, 2)}

Provide:
1. **Pattern observations** — What trends do you see across the days? (traffic, revenue, profitability, CTR)
2. **Risk assessment** — What could go wrong if current trends continue?
3. **Actionable recommendations** — Specific, practical next steps
4. **Budget recommendation** — Should ad spend increase, decrease, or hold stable? Why?

Then output a JSON confidence block at the end:
\`\`\`json
{
  "recommendedAction": "hold_budget" | "increase_budget" | "decrease_budget",
  "confidence": 0.0 to 1.0,
  "reasoning": "one sentence"
}
\`\`\`

Keep the analysis concise and data-driven. Focus on patterns, not single-day noise.`;

  console.log(`\n=== AI Trend Analysis (${history.totalDays} days: ${history.dateRange.first} → ${history.dateRange.last}) ===\n`);

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    messages: [{ role: "user", content: prompt }],
  });

  const generatedAt = new Date().toISOString();
  const dateStr = yesterdayDateStr();

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  console.log(text);
  console.log();

  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  const confidence = jsonMatch ? JSON.parse(jsonMatch[1]) : null;

  if (!confidence) {
    console.log("  (no confidence block in AI output → skipping S3 + DDB dual-write)\n");
    return;
  }

  const mdBody = `# AI Trend Analysis (${dateStr})\n\n${text}\n`;
  const s3Key = await putMarkdown(dateStr, generatedAt, "trend", mdBody);
  await putAiAnalysis({
    generatedAt,
    analysisType: "trend",
    forDate: dateStr,
    reasoning: confidence.reasoning,
    markdownS3Key: s3Key,
    recommendedAction: confidence.recommendedAction,
    sourceHistoryRange: history.dateRange,
    totalDaysAnalyzed: history.totalDays,
    confidence: confidence.confidence,
  });
  console.log(`  Saved → S3 cross-stitch-ai-reports/${s3Key}`);
  console.log(`  Saved → DDB CrossStitchBusinessHistory[AI_ANALYSIS#${generatedAt}#trend]\n`);
}

async function main() {
  await run();
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
