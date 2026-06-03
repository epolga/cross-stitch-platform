import "dotenv/config";
import { queryRange } from "../src/services/historyStore";

interface AiRow {
  SortKey: string;
  forDate: string;
  analysisType: string;
  recommendedAction?: string;
  confidence?: number;
  reasoning?: string;
  sourceHistoryRange?: { first: string; last: string };
}

async function main() {
  const allRows = await queryRange<AiRow>("AI_ANALYSIS");
  const records = allRows
    .filter((r) => r.analysisType === "trend" && r.recommendedAction && r.confidence !== undefined)
    .sort((a, b) => a.forDate.localeCompare(b.forDate));

  if (records.length === 0) {
    console.log("No trend recommendation records in DDB yet.");
    return;
  }

  // Action counts
  const actionCounts: Record<string, number> = {};
  for (const r of records) {
    actionCounts[r.recommendedAction!] = (actionCounts[r.recommendedAction!] || 0) + 1;
  }

  // Confidence distribution
  const highConfidence = records.filter((r) => r.confidence! >= 0.75).length;
  const medConfidence = records.filter((r) => r.confidence! >= 0.5 && r.confidence! < 0.75).length;
  const lowConfidence = records.filter((r) => r.confidence! < 0.5).length;
  const avgConfidence = records.reduce((sum, r) => sum + r.confidence!, 0) / records.length;

  // Recommendation changes over time
  const changes: { date: string; from: string; to: string }[] = [];
  for (let i = 1; i < records.length; i++) {
    if (records[i].recommendedAction !== records[i - 1].recommendedAction) {
      changes.push({
        date: records[i].forDate,
        from: records[i - 1].recommendedAction!,
        to: records[i].recommendedAction!,
      });
    }
  }

  console.log(`\n=== AI Recommendation History (${records.length} records) ===\n`);
  console.log(`  Date range: ${records[0].forDate} → ${records[records.length - 1].forDate}\n`);

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

  const lastAction = records[records.length - 1].recommendedAction!;
  let streak = 0;
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].recommendedAction === lastAction) streak++;
    else break;
  }
  console.log(`\n  Current streak: ${streak} day(s) of "${lastAction}"`);
  console.log();
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
