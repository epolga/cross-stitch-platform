import "dotenv/config";
import { formatDate, yesterdayDate } from "../src/services/dateUtils";
import { getPinAnalytics, type PinMetrics } from "../src/services/pinterestPinAnalytics";
import { getPinCreatedAt } from "../src/services/pinterestPinDetails";
import { putDesignPerformance, queryRange, type DesignPerformanceInput } from "../src/services/historyStore";

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

// Load the created_at cache from the most recent DESIGN_PERFORMANCE snapshot in DDB.
// This replaces the local file cache so the pipeline works in Lambda (no persistent filesystem).
async function loadCreatedAtFromDDB(): Promise<Record<string, string>> {
  const rows = await queryRange<{ SortKey: string; pinId: string; pinCreatedAt?: string; snapshotDate: string }>(
    "DESIGN_PERFORMANCE",
    { scanForward: false, limit: 500 }
  );
  if (rows.length === 0) return {};

  const latestDate = rows[0].snapshotDate;
  const cache: Record<string, string> = {};
  for (const row of rows) {
    if (row.snapshotDate !== latestDate) break; // only most recent snapshot
    if (row.pinId && row.pinCreatedAt) {
      cache[row.pinId] = row.pinCreatedAt;
    }
  }
  return cache;
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

export async function run(): Promise<void> {
  // Read pin map from DDB
  const pinMapRows = await queryRange<DesignPinRecord & { SortKey: string }>("DESIGN_PIN_MAP");
  const designs: DesignPinRecord[] = pinMapRows.map((r) => ({
    designId: r.designId,
    albumId: r.albumId,
    albumCaption: r.albumCaption,
    pinId: r.pinId,
    designCaption: r.designCaption,
    designUrl: r.designUrl,
  }));

  if (designs.length === 0) {
    throw new Error("No DESIGN_PIN_MAP rows found in DDB. Run `npm run pinmap` first.");
  }
  console.log(`Loaded ${designs.length} design-pin records from DDB`);

  // Load created_at cache from DDB (most recent DESIGN_PERFORMANCE snapshot)
  const cache = await loadCreatedAtFromDDB();
  const missing = designs.filter((d) => !cache[d.pinId]);
  if (missing.length > 0) {
    console.log(`Fetching created_at for ${missing.length} new pins from Pinterest...`);
    let done = 0;
    for (const d of missing) {
      const createdAt = await getPinCreatedAt(d.pinId);
      if (createdAt) cache[d.pinId] = createdAt;
      done++;
      process.stdout.write(`  ${done}/${missing.length} fetched\r`);
    }
    process.stdout.write("\n");
  } else {
    console.log(`created_at cache is complete (${Object.keys(cache).length} entries from DDB)`);
  }

  const endDate = yesterdayDate();
  const startDate = daysBefore(endDate, WINDOW_DAYS - 1);
  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);

  // Load analytics already written for this snapshot — lets us skip re-fetching on
  // re-runs and Lambda retries after a timeout.
  const cachedRows = await queryRange<{ pinId: string }>(
    "DESIGN_PERFORMANCE",
    { startKey: `${endStr}#00000`, endKey: `${endStr}#99999` }
  );
  const cachedPinIds = new Set(cachedRows.map((r) => r.pinId));
  const toFetch = designs.filter((d) => !cachedPinIds.has(d.pinId));

  if (cachedPinIds.size > 0) {
    console.log(`  ${cachedPinIds.size} pins already cached for ${endStr}, fetching ${toFetch.length} remaining`);
  }

  let successCount = cachedPinIds.size;
  let errorCount = 0;

  if (toFetch.length > 0) {
    console.log(`Fetching Pinterest metrics for window ${startStr} to ${endStr} (${WINDOW_DAYS}d)`);
    let done = 0;
    await processInBatches(toFetch, CONCURRENCY, async (d) => {
      let record: DesignPerformanceInput;
      try {
        const metrics = await getPinAnalytics(d.pinId, startStr, endStr);
        const pinCreatedAt = cache[d.pinId];
        const daysSinceCreation = pinCreatedAt ? daysSince(pinCreatedAt, endDate) : undefined;
        const effectiveDays = daysSinceCreation ? Math.min(daysSinceCreation, WINDOW_DAYS) : WINDOW_DAYS;
        record = {
          snapshotDate: endStr,
          windowLabel: `${WINDOW_DAYS}d`,
          windowStartDate: startStr,
          windowEndDate: endStr,
          ...d,
          ...metrics,
          pinCreatedAt,
          daysSinceCreation,
          savesPerDay: Math.round((metrics.saves / effectiveDays) * 1000) / 1000,
          impressionsPerDay: Math.round((metrics.impressions / effectiveDays) * 10) / 10,
        };
        successCount++;
      } catch (err) {
        record = {
          snapshotDate: endStr,
          windowLabel: `${WINDOW_DAYS}d`,
          windowStartDate: startStr,
          windowEndDate: endStr,
          ...d,
          ...ZERO_METRICS,
          error: err instanceof Error ? err.message : String(err),
        };
        errorCount++;
      }
      // Write immediately so a Lambda timeout doesn't lose progress
      await putDesignPerformance(record);
      done++;
      process.stdout.write(`  ${done}/${toFetch.length} fetched\r`);
      return record;
    });
    process.stdout.write("\n");
  }

  console.log(`  ${successCount} succeeded, ${errorCount} failed`);
  console.log(`Saved → DDB CrossStitchBusinessHistory[DESIGN_PERFORMANCE × ${successCount + errorCount}] (snapshotDate=${endStr})`);
}

async function main() {
  await run();
}

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  main().catch((err) => {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
