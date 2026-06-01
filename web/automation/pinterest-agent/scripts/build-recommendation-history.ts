import "dotenv/config";
import fs from "fs";
import path from "path";

interface Recommendation {
  date: string;
  analysisType: string;
  recommendedAction: string;
  confidence: number;
  reasoning: string;
  sourceHistoryRange: { first: string; last: string };
}

function main() {
  const historyPath = path.join(process.cwd(), "reports", "ai-recommendations-history.json");

  if (!fs.existsSync(historyPath)) {
    console.error("ai-recommendations-history.json not found. Run ai:trend first.");
    process.exit(1);
  }

  const records: Recommendation[] = JSON.parse(fs.readFileSync(historyPath, "utf-8"));

  if (records.length === 0) {
    console.log("No recommendations recorded yet.");
    return;
  }

  // Action counts
  const actionCounts: Record<string, number> = {};
  for (const r of records) {
    actionCounts[r.recommendedAction] = (actionCounts[r.recommendedAction] || 0) + 1;
  }

  // Confidence distribution
  const highConfidence = records.filter((r) => r.confidence >= 0.75).length;
  const medConfidence = records.filter((r) => r.confidence >= 0.5 && r.confidence < 0.75).length;
  const lowConfidence = records.filter((r) => r.confidence < 0.5).length;
  const avgConfidence = records.reduce((sum, r) => sum + r.confidence, 0) / records.length;

  // Recommendation changes over time
  const changes: { date: string; from: string; to: string }[] = [];
  for (let i = 1; i < records.length; i++) {
    if (records[i].recommendedAction !== records[i - 1].recommendedAction) {
      changes.push({
        date: records[i].date,
        from: records[i - 1].recommendedAction,
        to: records[i].recommendedAction,
      });
    }
  }

  // Print summary
  console.log(`\n=== AI Recommendation History (${records.length} records) ===\n`);
  console.log(`  Date range: ${records[0].date} → ${records[records.length - 1].date}\n`);

  console.log("  Action breakdown:");
  for (const [action, count] of Object.entries(actionCounts)) {
    const pct = ((count / records.length) * 100).toFixed(1);
    console.log(`    ${action}: ${count} (${pct}%)`);
  }

  console.log(`\n  Confidence distribution:`);
  console.log(`    High (≥0.75):  ${highConfidence}`);
  console.log(`    Medium (0.5–0.74): ${medConfidence}`);
  console.log(`    Low (<0.5):    ${lowConfidence}`);
  console.log(`    Average:       ${avgConfidence.toFixed(2)}`);

  if (changes.length > 0) {
    console.log(`\n  Recommendation changes (${changes.length}):`);
    for (const c of changes) {
      console.log(`    ${c.date}: ${c.from} → ${c.to}`);
    }
  } else {
    console.log(`\n  No recommendation changes — consistent "${records[0].recommendedAction}" throughout.`);
  }

  // Current streak
  const lastAction = records[records.length - 1].recommendedAction;
  let streak = 0;
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].recommendedAction === lastAction) streak++;
    else break;
  }
  console.log(`\n  Current streak: ${streak} day(s) of "${lastAction}"`);
  console.log();
}

main();
