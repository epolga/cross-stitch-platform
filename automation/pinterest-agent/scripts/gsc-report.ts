/**
 * Google Search Console report.
 *
 * Fetches GSC search analytics, sitemaps, and site list for cross-stitch.com,
 * then compares indexed pages against DynamoDB design metadata to produce an
 * indexed vs non-indexed design-page report.
 *
 * Configuration (env vars, all optional):
 *   GSC_SITE_URL        — verified site URL in GSC  (default: https://cross-stitch.com/)
 *   GSC_DAYS            — look-back window in days   (default: 90)
 *   GSC_INSPECT_LIMIT   — max URL inspections to run (default: 10)
 *   ITEMS_TABLE_NAME    — CrossStitchItems DDB table  (default: CrossStitchItems)
 *
 * Output files written to reports/gsc/:
 *   YYYY-MM-DD-gsc-sites.json
 *   YYYY-MM-DD-gsc-sitemaps.json
 *   YYYY-MM-DD-gsc-search-analytics.json
 *   YYYY-MM-DD-gsc-indexing-report.json   ← main comparison
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  listSearchConsoleSites,
  getSearchAnalyticsByPage,
  inspectUrl,
  listSitemaps,
  type GscPage,
  type UrlInspectionResult,
} from "../src/services/searchConsole";

dotenv.config({ path: path.join(process.cwd(), ".env") });

// ── Config ────────────────────────────────────────────────────────────────────

const SITE_URL = (process.env.GSC_SITE_URL ?? "https://cross-stitch.com/").replace(/\/?$/, "/");
const DAYS = Math.max(1, parseInt(process.env.GSC_DAYS ?? "90", 10));
const INSPECT_LIMIT = Math.max(0, parseInt(process.env.GSC_INSPECT_LIMIT ?? "10", 10));
const ITEMS_TABLE = process.env.ITEMS_TABLE_NAME ?? "CrossStitchItems";
const REGION = process.env.AWS_REGION ?? "us-east-1";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DesignEntry {
  designId: number;
  albumId: number;
  albumCaption: string;
  pinId: string;
  designCaption: string;
  designUrl: string;          // relative, e.g. /Cat-15-187-Free-Design.aspx
  nDownloaded: number;
}

interface IndexedDesign extends DesignEntry {
  fullUrl: string;
  gsc: Pick<GscPage, "clicks" | "impressions" | "ctr" | "position">;
}

interface UnindexedDesign extends DesignEntry {
  fullUrl: string;
  inspection?: UrlInspectionResult;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return dateStr(d);
}

function yesterdayStr(): string {
  return daysAgo(1);
}

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function save(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  console.log(`  Saved → ${filePath}`);
}

/** Extract the URL path from a full URL for comparison with relative design URLs. */
function urlPath(fullUrl: string): string {
  try {
    return new URL(fullUrl).pathname;
  } catch {
    return fullUrl;
  }
}

// ── DynamoDB: fetch NDownloaded for each design ───────────────────────────────

async function fetchDownloadCounts(
  designIds: number[],
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (designIds.length === 0) return counts;

  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
    marshallOptions: { removeUndefinedValues: true },
  });

  // Query Designs-index GSI (EntityType=DESIGN, range=NGlobalPage) — returns all
  // DESIGN rows. We project only DesignID + NDownloaded to keep it light.
  let exclusiveStartKey: Record<string, unknown> | undefined;
  const idSet = new Set(designIds);

  do {
    const resp = await ddb.send(
      new QueryCommand({
        TableName: ITEMS_TABLE,
        IndexName: "Designs-index",
        KeyConditionExpression: "EntityType = :et",
        ExpressionAttributeValues: { ":et": "DESIGN" },
        ProjectionExpression: "DesignID, NDownloaded",
        ExclusiveStartKey: exclusiveStartKey as Record<string, import("@aws-sdk/client-dynamodb").AttributeValue> | undefined,
      }),
    );

    for (const item of resp.Items ?? []) {
      const did = item["DesignID"] as number | undefined;
      if (did !== undefined && idSet.has(did)) {
        counts.set(did, (item["NDownloaded"] as number | undefined) ?? 0);
      }
    }

    exclusiveStartKey = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return counts;
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
const endDate = yesterdayStr();
const startDate = daysAgo(DAYS + 1);
const reportDate = yesterdayStr();
const gscDir = path.join(process.cwd(), "reports", "gsc");

console.log(`\nGSC report  site=${SITE_URL}  window=${startDate}→${endDate}  inspectLimit=${INSPECT_LIMIT}`);

ensureDir(gscDir);

// 1. Sites
console.log("\n[1/5] Listing GSC sites...");
const sites = await listSearchConsoleSites();
save(path.join(gscDir, `${reportDate}-gsc-sites.json`), sites);
console.log(`  ${sites.length} site(s) verified`);
sites.forEach((s) => console.log(`    ${s.permissionLevel.padEnd(20)} ${s.siteUrl}`));

if (sites.length === 0) {
  console.error("  ERROR: No verified sites found for this account.");
  process.exit(1);
}

// Prefer the site URL from the API (may be sc-domain: format) over the configured default.
// If GSC_SITE_URL is explicitly set, use it; otherwise pick the first owner-level site.
const activeSiteUrl =
  process.env.GSC_SITE_URL ??
  (sites.find((s) => s.permissionLevel === "siteOwner") ?? sites[0]).siteUrl;
console.log(`  Using site: ${activeSiteUrl}`);

// 2. Sitemaps
console.log("\n[2/5] Listing sitemaps...");
const sitemaps = await listSitemaps(activeSiteUrl);
save(path.join(gscDir, `${reportDate}-gsc-sitemaps.json`), sitemaps);
console.log(`  ${sitemaps.length} sitemap(s)`);
for (const sm of sitemaps) {
  const totals = sm.contents.map((c) => `${c.type}: ${c.indexed}/${c.submitted}`).join(", ");
  console.log(`    ${sm.path}  errors=${sm.errors}  ${totals}`);
}

// 3. Search analytics by page
console.log(`\n[3/5] Fetching search analytics (${startDate} → ${endDate})...`);
const gscPages = await getSearchAnalyticsByPage(activeSiteUrl, startDate, endDate);
save(path.join(gscDir, `${reportDate}-gsc-search-analytics.json`), gscPages);
console.log(`  ${gscPages.length} pages with GSC data`);

// Build path→GscPage lookup
const gscByPath = new Map<string, GscPage>();
for (const p of gscPages) {
  gscByPath.set(urlPath(p.page), p);
}

// 4. Load design-pin-map.json (source of truth for design URLs)
console.log("\n[4/5] Loading design-pin-map.json...");
const pinMapPath = path.join(process.cwd(), "reports", "design-pin-map.json");
if (!fs.existsSync(pinMapPath)) {
  console.error("  ERROR: reports/design-pin-map.json not found — run `npm run pinmap` first.");
  process.exit(1);
}

const rawPinMap = JSON.parse(fs.readFileSync(pinMapPath, "utf-8")) as Array<{
  designId: number;
  albumId: number;
  albumCaption: string;
  pinId: string;
  designCaption: string;
  designUrl: string;
}>;
console.log(`  ${rawPinMap.length} designs in pin map`);

// 5. Enrich with NDownloaded from DDB
console.log("\n[5/5] Fetching download counts from DynamoDB...");
let downloadCounts = new Map<number, number>();
try {
  downloadCounts = await fetchDownloadCounts(rawPinMap.map((d) => d.designId));
  console.log(`  Got download counts for ${downloadCounts.size} design(s)`);
} catch (err) {
  console.warn(`  WARNING: DDB download count fetch failed (${(err as Error).message}) — defaulting to 0`);
}

const designs: DesignEntry[] = rawPinMap.map((d) => ({
  ...d,
  nDownloaded: downloadCounts.get(d.designId) ?? 0,
}));

// 6. Compare: indexed (has GSC data) vs no GSC data
const indexed: IndexedDesign[] = [];
const noGscData: UnindexedDesign[] = [];

for (const d of designs) {
  const fullUrl = SITE_URL.replace(/\/$/, "") + d.designUrl;
  const gscEntry = gscByPath.get(d.designUrl);

  if (gscEntry) {
    indexed.push({
      ...d,
      fullUrl,
      gsc: {
        clicks: gscEntry.clicks,
        impressions: gscEntry.impressions,
        ctr: gscEntry.ctr,
        position: gscEntry.position,
      },
    });
  } else {
    noGscData.push({ ...d, fullUrl });
  }
}

// Sort: indexed by impressions desc; no-GSC by nDownloaded desc
indexed.sort((a, b) => b.gsc.impressions - a.gsc.impressions);
noGscData.sort((a, b) => b.nDownloaded - a.nDownloaded);

// 7. URL inspection for top N designs with no GSC data
const inspected: UnindexedDesign[] = [];
if (INSPECT_LIMIT > 0 && noGscData.length > 0) {
  const toInspect = noGscData.slice(0, INSPECT_LIMIT);
  console.log(`\n  Running URL inspection for ${toInspect.length} design(s) with no GSC data...`);

  for (const d of toInspect) {
    try {
      const result = await inspectUrl(activeSiteUrl, d.fullUrl);
      inspected.push({ ...d, inspection: result });
      console.log(`    ${d.fullUrl}  verdict=${result.verdict}  coverage="${result.coverageState}"`);
    } catch (err) {
      inspected.push(d);
      console.warn(`    ${d.fullUrl}  inspection failed: ${(err as Error).message}`);
    }
  }
}

// Merge inspection results back into noGscData
const inspectedByUrl = new Map(inspected.map((d) => [d.fullUrl, d.inspection]));
const noGscDataWithInspection = noGscData.map((d) => ({
  ...d,
  inspection: inspectedByUrl.get(d.fullUrl),
}));

// Verdict summary from inspections
const verdictCounts: Record<string, number> = {};
for (const d of inspected) {
  if (d.inspection) {
    verdictCounts[d.inspection.verdict] = (verdictCounts[d.inspection.verdict] ?? 0) + 1;
  }
}

// 8. Write indexing report
const report = {
  generatedAt: new Date().toISOString(),
  dateRange: { startDate, endDate },
  siteUrl: activeSiteUrl,
  lookbackDays: DAYS,
  summary: {
    totalDesigns: designs.length,
    withGscData: indexed.length,
    withoutGscData: noGscData.length,
    gscCoveragePercent: Math.round((indexed.length / designs.length) * 100),
    inspected: inspected.length,
    inspectionVerdicts: verdictCounts,
    totalImpressions: indexed.reduce((s, d) => s + d.gsc.impressions, 0),
    totalClicks: indexed.reduce((s, d) => s + d.gsc.clicks, 0),
    totalDownloads: designs.reduce((s, d) => s + d.nDownloaded, 0),
  },
  designsWithGscData: indexed,
  designsWithoutGscData: noGscDataWithInspection,
};

const reportPath = path.join(gscDir, `${reportDate}-gsc-indexing-report.json`);
save(reportPath, report);

// Console summary
console.log(`
══ GSC Indexing Summary ═══════════════════════════════════════
  Total designs          : ${report.summary.totalDesigns}
  With GSC impressions   : ${report.summary.withGscData} (${report.summary.gscCoveragePercent}%)
  No GSC data            : ${report.summary.withoutGscData}
  URL inspections run    : ${report.summary.inspected}
  Inspection verdicts    : ${JSON.stringify(report.summary.inspectionVerdicts)}
  Total impressions (GSC): ${report.summary.totalImpressions.toLocaleString()}
  Total clicks (GSC)     : ${report.summary.totalClicks.toLocaleString()}
  Total downloads (DDB)  : ${report.summary.totalDownloads.toLocaleString()}
═══════════════════════════════════════════════════════════════
`);
})();
