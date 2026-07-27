/**
 * Batch-extracts every catalog design's published kit PDF into the same
 * grid+palette JSON format /photo-to-cross-stitch uses, uploads each to the
 * private `cross-stitch-editor-designs` S3 bucket, and stamps
 * `EditorPatternKey` (+ `LastModifiedAt`) on the design so the site can show
 * an "Open in editor" link. Does NOT generate or touch any PDF — the site
 * only reads the JSON back through its own API route (the bucket has no
 * public access).
 *
 * Runs newest-first (ScanIndexForward: false on DesignsByID-index) — Olga
 * asked for descending DesignID order, not the oldest designs first.
 *
 * Tracking: presence of EditorPatternKey is the "already done" marker.
 * Already-done designs are skipped by default — pass --force to redo them
 * (e.g. after a pdf-pattern-extractor.ts bug fix, to reprocess designs that
 * previously extracted with warnings).
 *
 * Usage:
 *   npx tsx scripts/batch-extract-catalog-patterns.ts --report
 *   npx tsx scripts/batch-extract-catalog-patterns.ts --designIds=744,406,26
 *   npx tsx scripts/batch-extract-catalog-patterns.ts --limit 20
 *   npx tsx scripts/batch-extract-catalog-patterns.ts --limit 20 --dry-run
 *   npx tsx scripts/batch-extract-catalog-patterns.ts --all
 *   npx tsx scripts/batch-extract-catalog-patterns.ts --designIds=406 --force
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { extractPatternFromPdf } from '../src/lib/pdf-pattern-extractor';

// A full-catalog run makes thousands of sequential network calls (DDB pages,
// PDF fetches, S3 puts); a single transient blip (observed: ETIMEDOUT to a
// DynamoDB endpoint IP, despite the SDK's own 3 built-in attempts already
// exhausting) would otherwise crash the whole run instead of just that one
// call. Small extra retry layer on top of the SDK's own retries.
async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const delayMs = 500 * 2 ** i;
      console.warn(`    [retry] ${label} failed (attempt ${i + 1}/${attempts}): ${(e as Error).message} — retrying in ${delayMs}ms`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

const ITEMS_TABLE = process.env.ITEMS_TABLE_NAME ?? 'CrossStitchItems';
const REGION = process.env.AWS_REGION ?? 'us-east-1';
const BUCKET = 'cross-stitch-editor-designs';
const PDF_BASE = 'https://d2o1uvvg91z7o4.cloudfront.net/pdfs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const all = args.includes('--all');
const force = args.includes('--force');
const reportOnly = args.includes('--report');
const designIdsArg = args.find((a) => a.startsWith('--designIds='))?.split('=')[1];
const explicitDesignIds = designIdsArg ? designIdsArg.split(',').map((s) => parseInt(s.trim(), 10)) : null;

function flagValue(name: string, fallback: string): string {
  const eqForm = args.find((a) => a.startsWith(`${name}=`));
  if (eqForm) return eqForm.split('=')[1];
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) return args[idx + 1];
  return fallback;
}

const limit = all ? Infinity : parseInt(flagValue('--limit', '20'), 10);
const concurrency = parseInt(flagValue('--concurrency', '3'), 10);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });

interface DesignRow {
  id: string;
  nPage: string;
  designId: number;
  albumId: number;
  caption: string;
  hasEditorPattern: boolean;
}

/** Every DESIGN item, newest DesignID first. Base for --report/--all/--limit. */
async function fetchAllDesigns(): Promise<DesignRow[]> {
  const results: DesignRow[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const resp = await withRetry(
      () =>
        ddb.send(
          new QueryCommand({
            TableName: ITEMS_TABLE,
            IndexName: 'DesignsByID-index',
            KeyConditionExpression: 'EntityType = :et',
            ExpressionAttributeValues: { ':et': 'DESIGN' },
            ScanIndexForward: false, // newest DesignID first, per Olga's request
            ExclusiveStartKey: exclusiveStartKey as never,
          }),
        ),
      'fetchAllDesigns page',
    );

    for (const item of resp.Items ?? []) {
      results.push({
        id: item['ID'] as string,
        nPage: item['NPage'] as string,
        designId: item['DesignID'] as number,
        albumId: item['AlbumID'] as number,
        caption: (item['Caption'] as string) ?? '',
        hasEditorPattern: !!item['EditorPatternKey'],
      });
    }

    exclusiveStartKey = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return results;
}

async function fetchDesigns(): Promise<DesignRow[]> {
  const all_ = await fetchAllDesigns(); // already newest-first

  if (explicitDesignIds) {
    // Preserve requested order; an explicit ask is treated like --force.
    return explicitDesignIds
      .map((id) => all_.find((r) => r.designId === id))
      .filter((r): r is DesignRow => !!r);
  }

  const candidates = force ? all_ : all_.filter((r) => !r.hasEditorPattern);
  return limit === Infinity ? candidates : candidates.slice(0, limit);
}

async function printReport(): Promise<void> {
  console.log('\nScanning designs for editor-pattern coverage...');
  const all_ = await fetchAllDesigns();
  const done = all_.filter((r) => r.hasEditorPattern);

  console.log(`\n== Editor pattern coverage ==`);
  console.log(`  Done     : ${done.length} / ${all_.length} (${Math.round((done.length / all_.length) * 100)}%)`);
  console.log(`  Not done : ${all_.length - done.length}`);
  console.log();
}

async function processOne(design: DesignRow): Promise<{ ok: boolean; warnings: string[] }> {
  const pdfUrl = `${PDF_BASE}/${design.albumId}/Stitch${design.designId}_Kit.pdf`;
  let pdfBytes: Buffer;
  try {
    const res = await withRetry(() => fetch(pdfUrl), `PDF fetch DesignID=${design.designId}`);
    if (!res.ok) {
      console.warn(`  [skip] DesignID=${design.designId} — PDF fetch HTTP ${res.status}`);
      return { ok: false, warnings: [] };
    }
    pdfBytes = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.warn(`  [skip] DesignID=${design.designId} — PDF fetch error: ${(e as Error).message}`);
    return { ok: false, warnings: [] };
  }

  let pattern, warnings: string[];
  try {
    ({ pattern, warnings } = extractPatternFromPdf(pdfBytes));
  } catch (e) {
    console.warn(`  [skip] DesignID=${design.designId} — extraction error: ${(e as Error).message}`);
    return { ok: false, warnings: [] };
  }

  console.log(
    `  DesignID=${design.designId} "${design.caption}" — ${pattern.width}x${pattern.height}, ${pattern.palette.length} colors` +
      (warnings.length ? `, ${warnings.length} warning(s)` : ''),
  );
  for (const w of warnings) console.log(`    ! ${w}`);

  if (dryRun) {
    console.log(`    (dry-run, not uploaded/written)`);
    return { ok: true, warnings };
  }

  const key = `patterns/${design.designId}.json`;
  try {
    await withRetry(
      () =>
        s3.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: JSON.stringify({ ...pattern, title: design.caption }),
            ContentType: 'application/json',
          }),
        ),
      `S3 upload DesignID=${design.designId}`,
    );

    await withRetry(
      () =>
        ddb.send(
          new UpdateCommand({
            TableName: ITEMS_TABLE,
            Key: { ID: design.id, NPage: design.nPage },
            UpdateExpression: 'SET EditorPatternKey = :k, LastModifiedAt = :u',
            ExpressionAttributeValues: { ':k': key, ':u': new Date().toISOString() },
          }),
        ),
      `DDB stamp DesignID=${design.designId}`,
    );
  } catch (e) {
    console.warn(`  [skip] DesignID=${design.designId} — S3/DDB write failed after retries: ${(e as Error).message}`);
    return { ok: false, warnings };
  }

  console.log(`    ✓ uploaded to s3://${BUCKET}/${key}, DDB stamped`);
  return { ok: true, warnings };
}

(async () => {
  if (reportOnly) {
    await printReport();
    return;
  }

  console.log(
    `\nBatch-extract catalog patterns  ${explicitDesignIds ? `designIds=${explicitDesignIds.join(',')}` : `limit=${limit === Infinity ? 'all' : limit}`}  concurrency=${concurrency}  dryRun=${dryRun}  force=${force}`,
  );

  const designs = await fetchDesigns();
  console.log(`  Found ${designs.length} design(s) to process (newest DesignID first)\n`);

  let ok = 0;
  let failed = 0;
  const withWarnings: { designId: number; warnings: string[] }[] = [];

  for (let i = 0; i < designs.length; i += concurrency) {
    const chunk = designs.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map(processOne));
    results.forEach((r, j) => {
      if (r.ok) ok++;
      else failed++;
      if (r.warnings.length) withWarnings.push({ designId: chunk[j].designId, warnings: r.warnings });
    });
    console.log(`\n  --- ${Math.min(i + concurrency, designs.length)}/${designs.length} done ---`);
  }

  console.log(`\nDone. ok=${ok}  failed=${failed}  withWarnings=${withWarnings.length}`);
  if (withWarnings.length) {
    console.log('\nDesigns with warnings (review these):');
    for (const w of withWarnings) console.log(`  DesignID=${w.designId}: ${w.warnings.join(' | ')}`);
  }
})();
