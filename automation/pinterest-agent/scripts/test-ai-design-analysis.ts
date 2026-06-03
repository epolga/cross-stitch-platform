import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { yesterdayDateStr } from "../src/services/dateUtils";
import { putMarkdown } from "../src/services/aiArtifactStore";
import { putAiAnalysis, queryRange } from "../src/services/historyStore";

interface DesignPerformance {
  designId: number;
  albumId: number;
  albumCaption: string;
  pinId: string;
  designCaption: string;
  designUrl: string;
  impressions: number;
  clicks: number;
  outboundClicks: number;
  ctr: number;
  saves: number;
  pinCreatedAt?: string;
  daysSinceCreation?: number;
  savesPerDay?: number;
  impressionsPerDay?: number;
  error?: string;
}

interface PerformanceFile {
  generatedAt: string;
  window: { label: string; startDate: string; endDate: string };
  totalPins: number;
  successCount: number;
  errorCount: number;
  designs: DesignPerformance[];
}

interface AlbumAggregate {
  albumId: number;
  albumCaption: string;
  designCount: number;
  impressions: number;
  clicks: number;
  outboundClicks: number;
  saves: number;
  avgImpressionsPerDesign: number;
  ctr: number;
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey || apiKey === "your-key-here") {
  console.error("Set ANTHROPIC_API_KEY in .env");
  process.exit(1);
}

function aggregateByAlbum(designs: DesignPerformance[]): AlbumAggregate[] {
  const byAlbum = new Map<number, AlbumAggregate>();
  for (const d of designs) {
    if (d.error) continue;
    let agg = byAlbum.get(d.albumId);
    if (!agg) {
      agg = {
        albumId: d.albumId,
        albumCaption: d.albumCaption || "(unknown)",
        designCount: 0,
        impressions: 0,
        clicks: 0,
        outboundClicks: 0,
        saves: 0,
        avgImpressionsPerDesign: 0,
        ctr: 0,
      };
      byAlbum.set(d.albumId, agg);
    }
    agg.designCount++;
    agg.impressions += d.impressions;
    agg.clicks += d.clicks;
    agg.outboundClicks += d.outboundClicks;
    agg.saves += d.saves;
  }
  for (const agg of byAlbum.values()) {
    agg.avgImpressionsPerDesign =
      agg.designCount > 0 ? Math.round(agg.impressions / agg.designCount) : 0;
    agg.ctr =
      agg.impressions > 0
        ? Math.round((agg.clicks / agg.impressions) * 100000) / 100000
        : 0;
  }
  return [...byAlbum.values()].sort((a, b) => b.impressions - a.impressions);
}

async function main() {
  // Read design performance from DDB (latest snapshotDate = yesterday)
  const endStr = yesterdayDateStr();
  const perfRows = await queryRange<DesignPerformance & { SortKey: string; EntityType: string; snapshotDate: string; windowLabel: string; windowStartDate: string; windowEndDate: string; writtenAt: string }>("DESIGN_PERFORMANCE", {
    startKey: `${endStr}#00000`,
    endKey: `${endStr}#99999`,
  });

  if (perfRows.length === 0) {
    console.error(`No DESIGN_PERFORMANCE rows for snapshotDate=${endStr}. Run \`npm run perf\` first.`);
    process.exit(1);
  }

  const windowStartDate = perfRows[0].windowStartDate ?? endStr;
  const windowEndDate = perfRows[0].windowEndDate ?? endStr;
  const windowLabel = perfRows[0].windowLabel ?? "30d";

  const perf: PerformanceFile = {
    generatedAt: new Date().toISOString(),
    window: { label: windowLabel, startDate: windowStartDate, endDate: windowEndDate },
    totalPins: perfRows.length,
    successCount: perfRows.filter((r) => !r.error).length,
    errorCount: perfRows.filter((r) => r.error).length,
    designs: perfRows.map((r) => ({
      designId: r.designId,
      albumId: r.albumId,
      albumCaption: r.albumCaption,
      pinId: r.pinId,
      designCaption: r.designCaption,
      designUrl: r.designUrl,
      impressions: r.impressions,
      clicks: r.clicks,
      outboundClicks: r.outboundClicks,
      ctr: r.ctr,
      saves: r.saves,
      pinCreatedAt: r.pinCreatedAt,
      daysSinceCreation: r.daysSinceCreation,
      savesPerDay: r.savesPerDay,
      impressionsPerDay: r.impressionsPerDay,
      error: r.error,
    })),
  };

  const albumAggregates = aggregateByAlbum(perf.designs);

  const designSummary = perf.designs
    .filter((d) => !d.error)
    .map((d) => ({
      designId: d.designId,
      albumCaption: d.albumCaption,
      designCaption: d.designCaption,
      impressions: d.impressions,
      impressionsPerDay: d.impressionsPerDay,
      clicks: d.clicks,
      outboundClicks: d.outboundClicks,
      ctr: d.ctr,
      saves: d.saves,
      savesPerDay: d.savesPerDay,
      daysSinceCreation: d.daysSinceCreation,
    }))
    .sort((a, b) => (b.savesPerDay ?? 0) - (a.savesPerDay ?? 0));

  const summary = {
    window: perf.window,
    totalDesignsWithPins: perf.successCount,
    albumAggregates,
    designs: designSummary,
  };

  const prompt = `You are a content strategy analyst for a cross-stitch pattern website. The site monetizes via AdSense; traffic comes mostly from Pinterest. You're analyzing Pinterest pin performance to recommend which design types Olga should create more of.

Important context:
- Only ${perf.successCount} of ${perf.totalPins} designs have pin IDs. Olga started pinning a few months ago — sample is small and skewed toward recent designs.
- "Album" is the theme categorization (e.g. Cats, Birds, Bookmarks).
- Some albums have many designs, some have just 1–2 — be honest about statistical significance.
- Metrics window: ${perf.window.startDate} to ${perf.window.endDate} (${perf.window.label}).
- **Use normalized rates (savesPerDay, impressionsPerDay) as the primary comparison metric.** Raw saves and impressions are misleading because pins created recently have had less time to accumulate engagement than older ones. savesPerDay = saves in window / min(daysSinceCreation, 30). A pin with 5 saves in 5 days (savesPerDay=1.0) outperforms one with 20 saves in 200 days (savesPerDay=0.1).
- daysSinceCreation is the pin's age in days at the end of the window.

Performance data (designs sorted by savesPerDay desc):

${JSON.stringify(summary, null, 2)}

Answer three questions, with numbers from the data backing every claim:

1. **Which design themes/styles appear strongest?** Use savesPerDay and impressionsPerDay as primary metrics. Also look at album-level CTR. Distinguish "high volume because many designs" from "high rate per design". Note which top performers are young pins (daysSinceCreation < 30) — their rates are based on a shorter real window and may be even more impressive than they look.

2. **Which albums underperform?** Look at low impressionsPerDay or low CTR at album level. Explicitly flag albums with too few designs (< 3) as statistically inconclusive — don't recommend cutting them.

3. **Which design types should be created more?** Based on top savesPerDay performers, recommend 2–4 concrete design directions. Be specific (e.g. "close-up kitten face with large eyes and warm tabby coloring" — not "more cute animals").

Then add a short **Caveats** paragraph noting what this data can't see (seasonality, whether high saves convert to site visits, audience drift, Pinterest algorithm changes).

Output a JSON recommendation block at the end:

\`\`\`json
{
  "topAlbums": ["album1", "album2", "album3"],
  "underperformingAlbums": ["albumX"],
  "designDirectionsToCreate": ["specific direction 1", "specific direction 2"],
  "confidence": 0.0,
  "reasoning": "one sentence"
}
\`\`\`

Keep it concrete and data-grounded. Cite savesPerDay numbers, not just vibes.`;

  console.log(
    `\n=== AI Design Analysis (${perf.window.startDate} → ${perf.window.endDate}, ${perf.successCount} designs) ===\n`
  );

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
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
  const recommendation = jsonMatch ? JSON.parse(jsonMatch[1]) : null;

  if (!recommendation) {
    console.log("  (no recommendation block in AI output → skipping S3 + DDB dual-write)\n");
    return;
  }

  try {
    const mdBody = `# AI Design Analysis (${dateStr})\n\nWindow: ${perf.window.startDate} → ${perf.window.endDate}\nDesigns analyzed: ${perf.successCount}\n\n${text}\n`;
    const s3Key = await putMarkdown(dateStr, generatedAt, "design", mdBody);
    await putAiAnalysis({
      generatedAt,
      analysisType: "design",
      forDate: dateStr,
      reasoning: recommendation.reasoning,
      markdownS3Key: s3Key,
      topAlbums: recommendation.topAlbums,
      underperformingAlbums: recommendation.underperformingAlbums,
      designDirectionsToCreate: recommendation.designDirectionsToCreate,
      totalDesignsAnalyzed: perf.successCount,
      confidence: recommendation.confidence,
      sourceWindow: perf.window,
    });
    console.log(`  Saved → S3 cross-stitch-ai-reports/${s3Key}`);
    console.log(`  Saved → DDB CrossStitchBusinessHistory[AI_ANALYSIS#${generatedAt}#design]\n`);
  } catch (err) {
    console.error(`  S3/DDB dual-write failed:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
