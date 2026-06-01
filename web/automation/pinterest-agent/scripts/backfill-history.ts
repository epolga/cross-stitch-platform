// One-shot backfill of existing on-disk reports into CrossStitchBusinessHistory
// + cross-stitch-ai-reports S3. Idempotent: re-running overwrites DAILY_BUSINESS
// rows by date and skips AI_ANALYSIS entries that already have a row for the
// same (forDate, analysisType).
//
// AI_ANALYSIS rows use the source file's mtime as a synthesized `generatedAt` —
// pre-dual-write analyses don't carry the original AI call timestamp, so the
// file mtime is the best approximation. SortKey collisions are avoided by the
// presence check.
//
// Schema reference: plan/integration/business-history-schema.md §4.2, §4.3, §10.

import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  putDailyBusiness,
  putAiAnalysis,
  queryRange,
  type AnalysisType,
} from "../src/services/historyStore";
import { putMarkdown } from "../src/services/aiArtifactStore";
import type { BusinessReport } from "../src/services/types";

const REPORTS_DIR = path.join(process.cwd(), "reports");
const AI_DIR = path.join(REPORTS_DIR, "ai-analysis");

interface TrendAnalysisFile {
  date: string;
  totalDays: number;
  dateRange: { first: string; last: string };
  analysis: string;
  confidence: {
    recommendedAction: string;
    confidence: number;
    reasoning: string;
  } | null;
}

interface DesignAnalysisFile {
  date: string;
  window: { label: string; startDate: string; endDate: string };
  totalDesignsAnalyzed: number;
  analysis: string;
  recommendation: {
    topAlbums: string[];
    underperformingAlbums: string[];
    designDirectionsToCreate: string[];
    confidence: number;
    reasoning: string;
  } | null;
}

async function backfillDailyBusiness(): Promise<{ written: number; skipped: number }> {
  if (!fs.existsSync(REPORTS_DIR)) return { written: 0, skipped: 0 };
  const files = fs
    .readdirSync(REPORTS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}-business-report\.json$/.test(f))
    .sort();

  let written = 0;
  for (const f of files) {
    const filePath = path.join(REPORTS_DIR, f);
    const report = JSON.parse(fs.readFileSync(filePath, "utf-8")) as BusinessReport;
    await putDailyBusiness({
      date: report.date,
      spend: report.pinterestAds.spend,
      impressions: report.pinterestAds.impressions,
      clicks: report.pinterestAds.clicks,
      ctr: report.pinterestAds.ctr,
      cpc: report.pinterestAds.cpc,
      outboundClicks: report.pinterestAds.outboundClicks,
      ga4Sessions: report.ga4PinterestSessions.total,
      ga4PaidSessions: report.ga4PinterestSessions.paidSocial,
      ga4OrganicSessions: report.ga4PinterestSessions.organic,
      ga4ReferralSessions: report.ga4PinterestSessions.referral,
      adsenseRevenue: report.adsense.estimatedEarnings,
      revenuePerHundredSessions:
        report.derived.revenuePerHundredPinterestSessions ?? undefined,
      profit: report.derived.roughProfitEstimate,
    });
    console.log(`  DAILY_BUSINESS#${report.date} ← ${f}`);
    written++;
  }
  return { written, skipped: 0 };
}

async function backfillAiAnalyses(): Promise<{ written: number; skipped: number }> {
  if (!fs.existsSync(AI_DIR)) return { written: 0, skipped: 0 };

  // Build a presence set of (forDate, analysisType) already in DDB so we never
  // create a second row for the same conceptual analysis with a different
  // synthesized timestamp.
  const existing = await queryRange<{ forDate: string; analysisType: string }>(
    "AI_ANALYSIS"
  );
  const present = new Set(existing.map((r) => `${r.forDate}#${r.analysisType}`));

  const files = fs.readdirSync(AI_DIR).sort();
  let written = 0;
  let skipped = 0;

  for (const f of files) {
    const trendMatch = /^(\d{4}-\d{2}-\d{2})-trend-analysis\.json$/.exec(f);
    const designMatch = /^(\d{4}-\d{2}-\d{2})-design-analysis\.json$/.exec(f);
    if (!trendMatch && !designMatch) continue;

    const dateStr = (trendMatch || designMatch)![1];
    const analysisType: AnalysisType = trendMatch ? "trend" : "design";
    const key = `${dateStr}#${analysisType}`;

    if (present.has(key)) {
      console.log(`  skip AI_ANALYSIS ${analysisType}@${dateStr} (already in DDB)`);
      skipped++;
      continue;
    }

    const jsonPath = path.join(AI_DIR, f);
    const mdPath = jsonPath.replace(/\.json$/, ".md");
    if (!fs.existsSync(mdPath)) {
      console.warn(`  skip ${f} — companion .md missing at ${mdPath}`);
      skipped++;
      continue;
    }

    const mdBody = fs.readFileSync(mdPath, "utf-8");
    const generatedAt = fs.statSync(jsonPath).mtime.toISOString();

    if (analysisType === "trend") {
      const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as TrendAnalysisFile;
      if (!parsed.confidence) {
        console.log(`  skip AI_ANALYSIS trend@${dateStr} — no confidence block in source`);
        skipped++;
        continue;
      }
      const s3Key = await putMarkdown(dateStr, generatedAt, "trend", mdBody);
      await putAiAnalysis({
        generatedAt,
        analysisType: "trend",
        forDate: dateStr,
        reasoning: parsed.confidence.reasoning,
        markdownS3Key: s3Key,
        recommendedAction: parsed.confidence.recommendedAction,
        sourceHistoryRange: parsed.dateRange,
        totalDaysAnalyzed: parsed.totalDays,
        confidence: parsed.confidence.confidence,
      });
      console.log(`  AI_ANALYSIS#${generatedAt}#trend (forDate=${dateStr}) ← ${f}`);
      written++;
    } else {
      const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as DesignAnalysisFile;
      if (!parsed.recommendation) {
        console.log(`  skip AI_ANALYSIS design@${dateStr} — no recommendation block in source`);
        skipped++;
        continue;
      }
      const s3Key = await putMarkdown(dateStr, generatedAt, "design", mdBody);
      await putAiAnalysis({
        generatedAt,
        analysisType: "design",
        forDate: dateStr,
        reasoning: parsed.recommendation.reasoning,
        markdownS3Key: s3Key,
        topAlbums: parsed.recommendation.topAlbums,
        underperformingAlbums: parsed.recommendation.underperformingAlbums,
        designDirectionsToCreate: parsed.recommendation.designDirectionsToCreate,
        totalDesignsAnalyzed: parsed.totalDesignsAnalyzed,
        confidence: parsed.recommendation.confidence,
        sourceWindow: parsed.window,
      });
      console.log(`  AI_ANALYSIS#${generatedAt}#design (forDate=${dateStr}) ← ${f}`);
      written++;
    }
  }
  return { written, skipped };
}

async function main() {
  console.log("=== Backfill: reports/ → CrossStitchBusinessHistory + cross-stitch-ai-reports ===\n");

  console.log("DAILY_BUSINESS:");
  const daily = await backfillDailyBusiness();
  console.log(`  total: ${daily.written} written, ${daily.skipped} skipped\n`);

  console.log("AI_ANALYSIS:");
  const ai = await backfillAiAnalyses();
  console.log(`  total: ${ai.written} written, ${ai.skipped} skipped\n`);

  console.log("Done.");
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
