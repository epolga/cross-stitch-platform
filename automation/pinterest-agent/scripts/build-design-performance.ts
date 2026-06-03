import "dotenv/config";
import fs from "fs";
import path from "path";
import { formatDate, yesterdayDate } from "../src/services/dateUtils";
import { getPinAnalytics, type PinMetrics } from "../src/services/pinterestPinAnalytics";
import { getPinCreatedAt } from "../src/services/pinterestPinDetails";
import { batchPutDesignPerformance, queryRange } from "../src/services/historyStore";

interface DesignPinRecord {
  designId: number;
  albumId: number;
  albumCaption: string;
  pinId: string;
  designCaption: string;
  designUrl: string;
}

interface DesignPerformanceRecord extends DesignPinRecord, PinMetrics {
  pinCreatedAt?: string;
  daysSinceCreation?: number;
  savesPerDay?: number;
  impressionsPerDay?: number;
  error?: string;
}

const ZERO_METRICS: PinMetrics = {
  impressions: 0,
  clicks: 0,
  outboundClicks: 0,
  ctr: 0,
  saves: 0,
};

const WINDOW_DAYS = 30;
const CONCURRENCY = 1;

const CACHE_PATH = path.join(process.cwd(), "reports", "pin-created-at-cache.json");

function loadCreatedAtCache(): Record<string, string> {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveCreatedAtCache(cache: Record<string, string>): void {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
}

function daysBefore(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - n);
  return d;
}

function daysSince(isoDate: string, reference: Date): number {
  const created = new Date(isoDate);
  const diffMs = reference.getTime() - created.getTime();
  return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

async function processInBatches<T, U>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<U>
): Promise<U[]> {
  const out: U[] = new Array(items.length);
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(fn));
    for (let j = 0; j < results.length; j++) out[i + j] = results[j];
  }
  return out;
}

async function main() {
  // Read pin map from DDB
  const pinMapRows = await queryRange<DesignPinRecord & { SortKey: string; EntityType: string; writtenAt: string }>("DESIGN_PIN_MAP");
  const designs: DesignPinRecord[] = pinMapRows.map((r) => ({
    designId: r.designId,
    albumId: r.albumId,
    albumCaption: r.albumCaption,
    pinId: r.pinId,
    designCaption: r.designCaption,
    designUrl: r.designUrl,
  }));

  if (designs.length === 0) {
    console.error("No DESIGN_PIN_MAP rows found in DDB. Run `npm run pinmap` first.");
    process.exit(1);
  }
  console.log(`Loaded ${designs.length} design-pin records from DDB`);

  // Load created_at cache and fetch missing entries from Pinterest
  const cache = loadCreatedAtCache();
  const missing = designs.filter((d) => !cache[d.pinId]);
  if (missing.length > 0) {
    console.log(`Fetching created_at for ${missing.length} pins from Pinterest...`);
    let done = 0;
    for (const d of missing) {
      const createdAt = await getPinCreatedAt(d.pinId);
      if (createdAt) cache[d.pinId] = createdAt;
      done++;
      process.stdout.write(`  ${done}/${missing.length} fetched\r`);
    }
    process.stdout.write("\n");
    saveCreatedAtCache(cache);
    console.log(`  Saved → ${CACHE_PATH}`);
  } else {
    console.log(`created_at cache is complete (${Object.keys(cache).length} entries)`);
  }

  const endDate = yesterdayDate();
  const startDate = daysBefore(endDate, WINDOW_DAYS - 1);
  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);

  console.log(`Fetching Pinterest metrics for window ${startStr} to ${endStr} (${WINDOW_DAYS}d)`);

  let done = 0;
  const enriched = await processInBatches(designs, CONCURRENCY, async (d) => {
    try {
      const metrics = await getPinAnalytics(d.pinId, startStr, endStr);
      done++;
      process.stdout.write(`  ${done}/${designs.length} fetched\r`);

      const pinCreatedAt = cache[d.pinId];
      const daysSinceCreation = pinCreatedAt ? daysSince(pinCreatedAt, endDate) : undefined;
      const effectiveDays = daysSinceCreation ? Math.min(daysSinceCreation, WINDOW_DAYS) : WINDOW_DAYS;
      const savesPerDay = Math.round((metrics.saves / effectiveDays) * 1000) / 1000;
      const impressionsPerDay = Math.round((metrics.impressions / effectiveDays) * 10) / 10;

      return {
        ...d,
        ...metrics,
        pinCreatedAt,
        daysSinceCreation,
        savesPerDay,
        impressionsPerDay,
      } as DesignPerformanceRecord;
    } catch (err) {
      done++;
      process.stdout.write(`  ${done}/${designs.length} fetched\r`);
      return {
        ...d,
        ...ZERO_METRICS,
        error: err instanceof Error ? err.message : String(err),
      } as DesignPerformanceRecord;
    }
  });
  process.stdout.write("\n");

  const successCount = enriched.filter((r) => !r.error).length;
  const errorCount = enriched.length - successCount;
  console.log(`  ${successCount} succeeded, ${errorCount} failed`);

  try {
    const ddbInputs = enriched.map((r) => ({
      snapshotDate: endStr,
      windowLabel: `${WINDOW_DAYS}d`,
      windowStartDate: startStr,
      windowEndDate: endStr,
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
    }));
    await batchPutDesignPerformance(ddbInputs);
    console.log(`Saved → DDB CrossStitchBusinessHistory[DESIGN_PERFORMANCE × ${ddbInputs.length}] (snapshotDate=${endStr})`);
  } catch (err) {
    console.error(`  DDB write failed:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
