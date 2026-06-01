// Compare every on-disk report under reports/ against the matching DDB rows in
// CrossStitchBusinessHistory (and S3 bodies in cross-stitch-ai-reports). Exits
// non-zero on any mismatch.
//
// Intended for two uses:
//   1. Post-backfill audit — one-shot check that backfill landed cleanly.
//   2. Daily soak-window check — runs after the dual-write cron each morning;
//      a non-zero exit surfaces drift in daily-run.log.
//
// Parity convention:
//   - JSON exists ↔ DDB row exists, fields equal.
//   - JSON with confidence/recommendation = null  ↔  no DDB row (both absent).
//   - DESIGN_PIN_MAP and DESIGN_PERFORMANCE snapshots compared against the
//     latest on-disk JSON (current snapshot only).

import "dotenv/config";
import fs from "fs";
import path from "path";
import { queryRange } from "../src/services/historyStore";
import { getMarkdown } from "../src/services/aiArtifactStore";
import type { BusinessReport } from "../src/services/types";

const REPORTS_DIR = path.join(process.cwd(), "reports");
const AI_DIR = path.join(REPORTS_DIR, "ai-analysis");
const NUMERIC_EPSILON = 1e-6;

const errors: string[] = [];
let passed = 0;
let warnings = 0;

function fail(file: string, msg: string): void {
  errors.push(`  ✗ ${file}: ${msg}`);
}
function pass(file: string): void {
  passed++;
  console.log(`  ✓ ${file}`);
}
function warn(file: string, msg: string): void {
  warnings++;
  console.log(`  ⚠ ${file}: ${msg}`);
}

function eqNum(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return Math.abs(a - b) < NUMERIC_EPSILON;
}

// Stable stringify: sorts object keys so DDB's key order doesn't cause false
// diffs against the on-disk JSON. Array order is preserved (it matters).
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

function eqJson(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

// DAILY_BUSINESS

interface DailyRow {
  SortKey: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  outboundClicks: number;
  ga4Sessions: number;
  ga4PaidSessions: number;
  ga4OrganicSessions: number;
  ga4ReferralSessions: number;
  adsenseRevenue: number;
  revenuePerHundredSessions?: number;
  profit: number;
}

async function checkDailyBusiness(): Promise<void> {
  console.log("\nDAILY_BUSINESS:");
  if (!fs.existsSync(REPORTS_DIR)) return;
  const files = fs
    .readdirSync(REPORTS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}-business-report\.json$/.test(f))
    .sort();
  if (files.length === 0) {
    console.log("  (no business reports on disk)");
    return;
  }
  const rows = await queryRange<DailyRow>("DAILY_BUSINESS");
  const byDate = new Map(rows.map((r) => [r.SortKey, r]));

  for (const f of files) {
    const report = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, f), "utf-8")) as BusinessReport;
    const row = byDate.get(report.date);
    if (!row) {
      fail(f, `no DDB row for date=${report.date}`);
      continue;
    }
    const diffs: string[] = [];
    if (!eqNum(report.pinterestAds.spend, row.spend)) diffs.push(`spend ${report.pinterestAds.spend} vs ${row.spend}`);
    if (report.pinterestAds.impressions !== row.impressions) diffs.push(`impressions ${report.pinterestAds.impressions} vs ${row.impressions}`);
    if (report.pinterestAds.clicks !== row.clicks) diffs.push(`clicks ${report.pinterestAds.clicks} vs ${row.clicks}`);
    if (!eqNum(report.pinterestAds.ctr, row.ctr)) diffs.push(`ctr ${report.pinterestAds.ctr} vs ${row.ctr}`);
    if (!eqNum(report.pinterestAds.cpc, row.cpc)) diffs.push(`cpc ${report.pinterestAds.cpc} vs ${row.cpc}`);
    if (report.pinterestAds.outboundClicks !== row.outboundClicks) diffs.push(`outboundClicks ${report.pinterestAds.outboundClicks} vs ${row.outboundClicks}`);
    if (report.ga4PinterestSessions.total !== row.ga4Sessions) diffs.push(`ga4Sessions ${report.ga4PinterestSessions.total} vs ${row.ga4Sessions}`);
    if (report.ga4PinterestSessions.paidSocial !== row.ga4PaidSessions) diffs.push(`ga4PaidSessions ${report.ga4PinterestSessions.paidSocial} vs ${row.ga4PaidSessions}`);
    if (report.ga4PinterestSessions.organic !== row.ga4OrganicSessions) diffs.push(`ga4OrganicSessions ${report.ga4PinterestSessions.organic} vs ${row.ga4OrganicSessions}`);
    if (report.ga4PinterestSessions.referral !== row.ga4ReferralSessions) diffs.push(`ga4ReferralSessions ${report.ga4PinterestSessions.referral} vs ${row.ga4ReferralSessions}`);
    if (!eqNum(report.adsense.estimatedEarnings, row.adsenseRevenue)) diffs.push(`adsenseRevenue ${report.adsense.estimatedEarnings} vs ${row.adsenseRevenue}`);
    if (!eqNum(report.derived.roughProfitEstimate, row.profit)) diffs.push(`profit ${report.derived.roughProfitEstimate} vs ${row.profit}`);

    const jsonRev = report.derived.revenuePerHundredPinterestSessions;
    if (jsonRev === null || jsonRev === undefined) {
      if (row.revenuePerHundredSessions !== undefined) diffs.push(`revenuePerHundredSessions: JSON=null DDB=${row.revenuePerHundredSessions}`);
    } else {
      if (!eqNum(jsonRev, row.revenuePerHundredSessions)) diffs.push(`revenuePerHundredSessions ${jsonRev} vs ${row.revenuePerHundredSessions}`);
    }

    if (diffs.length) fail(f, diffs.join("; "));
    else pass(f);
  }
}

// DESIGN_PIN_MAP

interface PinMapRow {
  SortKey: string;
  designId: number;
  albumId: number;
  albumCaption: string;
  pinId: string;
  designCaption: string;
  designUrl: string;
}

async function checkDesignPinMap(): Promise<void> {
  console.log("\nDESIGN_PIN_MAP:");
  const jsonPath = path.join(REPORTS_DIR, "design-pin-map.json");
  if (!fs.existsSync(jsonPath)) {
    console.log("  (design-pin-map.json absent)");
    return;
  }
  const local = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as Array<{
    designId: number;
    albumId: number;
    albumCaption: string;
    pinId: string;
    designCaption: string;
    designUrl: string;
  }>;
  const rows = await queryRange<PinMapRow>("DESIGN_PIN_MAP");

  if (local.length !== rows.length) {
    fail("design-pin-map.json", `count mismatch: JSON=${local.length} DDB=${rows.length}`);
    return;
  }

  const byDesignId = new Map(rows.map((r) => [r.designId, r]));
  const diffs: string[] = [];
  for (const j of local) {
    const r = byDesignId.get(j.designId);
    if (!r) {
      diffs.push(`designId=${j.designId} missing in DDB`);
      continue;
    }
    if (j.albumId !== r.albumId) diffs.push(`designId=${j.designId} albumId ${j.albumId} vs ${r.albumId}`);
    if (j.albumCaption !== r.albumCaption) diffs.push(`designId=${j.designId} albumCaption "${j.albumCaption}" vs "${r.albumCaption}"`);
    if (j.pinId !== r.pinId) diffs.push(`designId=${j.designId} pinId ${j.pinId} vs ${r.pinId}`);
    if (j.designCaption !== r.designCaption) diffs.push(`designId=${j.designId} designCaption "${j.designCaption}" vs "${r.designCaption}"`);
    if (j.designUrl !== r.designUrl) diffs.push(`designId=${j.designId} designUrl ${j.designUrl} vs ${r.designUrl}`);
  }
  if (diffs.length) fail("design-pin-map.json", `${diffs.length} mismatches; first: ${diffs[0]}`);
  else pass(`design-pin-map.json (${local.length} records)`);
}

// DESIGN_PERFORMANCE (latest snapshot only)

interface PerfRow {
  SortKey: string;
  snapshotDate: string;
  designId: number;
  impressions: number;
  clicks: number;
  outboundClicks: number;
  ctr: number;
  saves: number;
}

async function checkDesignPerformance(): Promise<void> {
  console.log("\nDESIGN_PERFORMANCE (latest snapshot):");
  const jsonPath = path.join(REPORTS_DIR, "design-performance.json");
  if (!fs.existsSync(jsonPath)) {
    console.log("  (design-performance.json absent)");
    return;
  }
  const local = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as {
    window: { endDate: string };
    designs: Array<{
      designId: number;
      impressions: number;
      clicks: number;
      outboundClicks: number;
      ctr: number;
      saves: number;
      error?: string;
    }>;
  };
  const snapshotDate = local.window.endDate;
  const all = await queryRange<PerfRow>("DESIGN_PERFORMANCE");
  const rows = all.filter((r) => r.snapshotDate === snapshotDate);

  if (local.designs.length !== rows.length) {
    fail("design-performance.json", `count for snapshotDate=${snapshotDate}: JSON=${local.designs.length} DDB=${rows.length}`);
    return;
  }

  const byDesignId = new Map(rows.map((r) => [r.designId, r]));
  const diffs: string[] = [];
  for (const j of local.designs) {
    const r = byDesignId.get(j.designId);
    if (!r) {
      diffs.push(`designId=${j.designId} missing in DDB`);
      continue;
    }
    if (j.impressions !== r.impressions) diffs.push(`designId=${j.designId} impressions ${j.impressions} vs ${r.impressions}`);
    if (j.clicks !== r.clicks) diffs.push(`designId=${j.designId} clicks ${j.clicks} vs ${r.clicks}`);
    if (j.outboundClicks !== r.outboundClicks) diffs.push(`designId=${j.designId} outboundClicks ${j.outboundClicks} vs ${r.outboundClicks}`);
    if (!eqNum(j.ctr, r.ctr)) diffs.push(`designId=${j.designId} ctr ${j.ctr} vs ${r.ctr}`);
    if (j.saves !== r.saves) diffs.push(`designId=${j.designId} saves ${j.saves} vs ${r.saves}`);
  }
  if (diffs.length) fail("design-performance.json", `${diffs.length} mismatches; first: ${diffs[0]}`);
  else pass(`design-performance.json (snapshotDate=${snapshotDate}, ${local.designs.length} records)`);
}

// AI_ANALYSIS (one row per (forDate, type); body in S3)

interface AiRow {
  SortKey: string;
  analysisType: string;
  forDate: string;
  reasoning: string;
  markdownS3Key: string;
  recommendedAction?: string;
  sourceHistoryRange?: { first: string; last: string };
  totalDaysAnalyzed?: number;
  topAlbums?: string[];
  underperformingAlbums?: string[];
  designDirectionsToCreate?: string[];
  totalDesignsAnalyzed?: number;
  confidence?: number;
  sourceWindow?: { label: string; startDate: string; endDate: string };
  writtenAt: string;
}

async function checkAiAnalyses(): Promise<void> {
  console.log("\nAI_ANALYSIS:");
  if (!fs.existsSync(AI_DIR)) {
    console.log("  (no ai-analysis directory)");
    return;
  }
  const allRows = await queryRange<AiRow>("AI_ANALYSIS");

  // Index by (forDate, analysisType) — pick most recent if duplicates.
  const byKey = new Map<string, AiRow>();
  for (const r of allRows) {
    const k = `${r.forDate}#${r.analysisType}`;
    const prev = byKey.get(k);
    if (!prev || r.SortKey > prev.SortKey) byKey.set(k, r);
  }

  const files = fs.readdirSync(AI_DIR).filter((f) => /-(trend|design)-analysis\.json$/.test(f)).sort();
  for (const f of files) {
    const isTrend = f.endsWith("-trend-analysis.json");
    const analysisType = isTrend ? "trend" : "design";
    const dateStr = f.slice(0, 10);
    const key = `${dateStr}#${analysisType}`;
    const jsonPath = path.join(AI_DIR, f);
    const mdPath = jsonPath.replace(/\.json$/, ".md");

    const local = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as Record<string, unknown>;
    const structured = isTrend ? local.confidence : local.recommendation;

    const row = byKey.get(key);

    if (!structured) {
      if (row) fail(f, `JSON has no ${isTrend ? "confidence" : "recommendation"} block, but DDB has a row at ${row.SortKey}`);
      else warn(f, `no structured block in JSON, no DDB row — expected parity gap`);
      continue;
    }
    if (!row) {
      fail(f, `no DDB row for ${key} (JSON has structured block)`);
      continue;
    }

    const diffs: string[] = [];

    if (isTrend) {
      const conf = structured as { recommendedAction: string; confidence: number; reasoning: string };
      const localShape = local as { date: string; totalDays: number; dateRange: { first: string; last: string } };
      if (row.forDate !== localShape.date) diffs.push(`forDate ${row.forDate} vs ${localShape.date}`);
      if (row.recommendedAction !== conf.recommendedAction) diffs.push(`recommendedAction "${row.recommendedAction}" vs "${conf.recommendedAction}"`);
      if (!eqNum(row.confidence, conf.confidence)) diffs.push(`confidence ${row.confidence} vs ${conf.confidence}`);
      if (row.reasoning !== conf.reasoning) diffs.push(`reasoning mismatch`);
      if (row.totalDaysAnalyzed !== localShape.totalDays) diffs.push(`totalDaysAnalyzed ${row.totalDaysAnalyzed} vs ${localShape.totalDays}`);
      if (!eqJson(row.sourceHistoryRange, localShape.dateRange)) diffs.push(`sourceHistoryRange ${JSON.stringify(row.sourceHistoryRange)} vs ${JSON.stringify(localShape.dateRange)}`);
    } else {
      const rec = structured as {
        topAlbums: string[];
        underperformingAlbums: string[];
        designDirectionsToCreate: string[];
        confidence: number;
        reasoning: string;
      };
      const localShape = local as {
        date: string;
        window: { label: string; startDate: string; endDate: string };
        totalDesignsAnalyzed: number;
      };
      if (row.forDate !== localShape.date) diffs.push(`forDate ${row.forDate} vs ${localShape.date}`);
      if (!eqJson(row.topAlbums, rec.topAlbums)) diffs.push(`topAlbums differ`);
      if (!eqJson(row.underperformingAlbums, rec.underperformingAlbums)) diffs.push(`underperformingAlbums differ`);
      if (!eqJson(row.designDirectionsToCreate, rec.designDirectionsToCreate)) diffs.push(`designDirectionsToCreate differ`);
      if (!eqNum(row.confidence, rec.confidence)) diffs.push(`confidence ${row.confidence} vs ${rec.confidence}`);
      if (row.reasoning !== rec.reasoning) diffs.push(`reasoning mismatch`);
      if (row.totalDesignsAnalyzed !== localShape.totalDesignsAnalyzed) diffs.push(`totalDesignsAnalyzed ${row.totalDesignsAnalyzed} vs ${localShape.totalDesignsAnalyzed}`);
      if (!eqJson(row.sourceWindow, localShape.window)) diffs.push(`sourceWindow mismatch`);
    }

    // Compare S3 body byte-for-byte against the local .md.
    if (fs.existsSync(mdPath)) {
      try {
        const s3Body = await getMarkdown(row.markdownS3Key);
        const localBody = fs.readFileSync(mdPath, "utf-8");
        if (s3Body !== localBody) {
          diffs.push(`S3 body differs from local .md (S3=${s3Body.length} chars, local=${localBody.length} chars)`);
        }
      } catch (err) {
        diffs.push(`S3 fetch failed: ${err instanceof Error ? err.message : err}`);
      }
    } else {
      warn(f, `companion .md missing on disk; skipping body byte-compare`);
    }

    if (diffs.length) fail(f, diffs.join("; "));
    else pass(`${f} (${row.SortKey})`);
  }
}

async function main() {
  console.log("=== Parity check: reports/ ↔ CrossStitchBusinessHistory + S3 ===");

  await checkDailyBusiness();
  await checkDesignPinMap();
  await checkDesignPerformance();
  await checkAiAnalyses();

  console.log("\n=== Summary ===");
  console.log(`  ${passed} passed, ${warnings} warnings, ${errors.length} failed`);
  if (errors.length > 0) {
    console.log("\nFailures:");
    for (const e of errors) console.log(e);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
