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

async function main() {
  const historyPath = path.join(process.cwd(), "reports", "business-history.json");

  if (!fs.existsSync(historyPath)) {
    console.error("business-history.json not found. Run build-business-history.ts first.");
    process.exit(1);
  }

  const history: BusinessHistory = JSON.parse(fs.readFileSync(historyPath, "utf-8"));

  if (history.totalDays < 2) {
    console.error("Need at least 2 days of data for trend analysis.");
    process.exit(1);
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

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  console.log(text);
  console.log();

  // Save to reports/ai-analysis/
  const dateStr = yesterdayDateStr();
  const analysisDir = path.join(process.cwd(), "reports", "ai-analysis");
  if (!fs.existsSync(analysisDir)) {
    fs.mkdirSync(analysisDir, { recursive: true });
  }

  // Save markdown
  const mdPath = path.join(analysisDir, `${dateStr}-trend-analysis.md`);
  fs.writeFileSync(mdPath, `# AI Trend Analysis (${dateStr})\n\n${text}\n`);

  // Extract JSON confidence block if present
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  const confidence = jsonMatch ? JSON.parse(jsonMatch[1]) : null;

  // Save confidence block separately
  if (confidence) {
    const confidencePath = path.join(analysisDir, `${dateStr}-confidence.json`);
    fs.writeFileSync(confidencePath, JSON.stringify(confidence, null, 2) + "\n");
    console.log(`  Saved → ${confidencePath}`);
  }

  // Save JSON
  const jsonPath = path.join(analysisDir, `${dateStr}-trend-analysis.json`);
  const jsonReport = {
    date: dateStr,
    totalDays: history.totalDays,
    dateRange: history.dateRange,
    analysis: text,
    confidence,
  };
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2) + "\n");

  // Append to recommendations history
  if (confidence) {
    const historyFilePath = path.join(process.cwd(), "reports", "ai-recommendations-history.json");
    const existing: unknown[] = fs.existsSync(historyFilePath)
      ? JSON.parse(fs.readFileSync(historyFilePath, "utf-8"))
      : [];

    existing.push({
      date: dateStr,
      analysisType: "trend",
      recommendedAction: confidence.recommendedAction,
      confidence: confidence.confidence,
      reasoning: confidence.reasoning,
      sourceHistoryRange: history.dateRange,
    });

    fs.writeFileSync(historyFilePath, JSON.stringify(existing, null, 2) + "\n");
    console.log(`  Saved → ${historyFilePath}`);
  }

  console.log(`  Saved → ${mdPath}`);
  console.log(`  Saved → ${jsonPath}\n`);

  // Dual-write to S3 + DynamoDB. JSON above stays as the canonical artifact
  // during the parity-verified soak window. We only persist a DDB row when
  // the AI produced a structured confidence block — without it there's no
  // reasoning/recommendedAction to record, so the row would be incomplete.
  // Schema reference: plan/integration/business-history-schema.md §4.3, §10.
  if (!confidence) {
    console.log("  (no confidence block in AI output → skipping S3 + DDB dual-write)\n");
    return;
  }
  try {
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
  } catch (err) {
    console.error(`  S3/DDB dual-write failed:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
