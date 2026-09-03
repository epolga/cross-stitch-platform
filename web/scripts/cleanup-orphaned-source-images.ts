/**
 * Track B of docs/web/source-image-key-sharing-and-orphans-2026-09.md:
 * clears the S3 backlog of orphaned sourceImageKey/researchImageKey/
 * sourceImageMaskKey objects (pattern-source-images/, research-uploads/
 * in cross-stitch-designs) — mostly from converter sessions that were
 * never saved as a pattern, not from deletions (Track A already stops
 * deletion-caused leakage as of 2026-09-03).
 *
 * Deliberately a REAL cross-reference against ConverterPatterns, not a
 * blind age-based S3 lifecycle rule: these keys are content-addressed
 * and never rewritten, so an old-but-still-referenced object (e.g. from
 * a pattern saved months ago and never touched since) has the same
 * LastModified as real garbage — age alone can't tell them apart. A
 * lifecycle rule would eventually delete images real, live patterns
 * still depend on for "Redo from Photo".
 *
 * Age is used only as a safety margin on top of the real reference
 * check (--grace-hours, default 48): an object with no current DDB
 * reference might just belong to a session that hasn't hit Save yet, so
 * skip anything newer than the grace period regardless of reference
 * status.
 *
 * This is NOT a one-off migration like backfill-thumbnails-to-s3.ts was
 * (deleted after use) — new orphans accumulate continuously from ordinary
 * "tried the converter, didn't save" usage, so this stays a reusable
 * maintenance script. The bucket has versioning + a 90-day noncurrent-
 * version lifecycle rule already, so any delete here is recoverable for
 * 90 days without extra configuration.
 *
 * Defaults to a dry run (reports what would be deleted, deletes nothing).
 * Pass --confirm to actually delete from S3.
 *
 * Usage:
 *   npx tsx scripts/cleanup-orphaned-source-images.ts                    # dry run, 48h grace
 *   npx tsx scripts/cleanup-orphaned-source-images.ts --grace-hours=72   # custom grace period
 *   npx tsx scripts/cleanup-orphaned-source-images.ts --confirm          # apply
 */

import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

const TABLE = process.env.DDB_PATTERNS_TABLE || 'ConverterPatterns';
const REGION = process.env.AWS_REGION || 'us-east-1';
const BUCKET = 'cross-stitch-designs';
const PREFIXES = ['pattern-source-images/', 'research-uploads/'];

const confirm = process.argv.includes('--confirm');
const graceHoursArg = process.argv.find((a) => a.startsWith('--grace-hours='));
const graceHours = graceHoursArg ? Number(graceHoursArg.split('=')[1]) : 48;

const ddb = new DynamoDBClient({ region: REGION });
const s3 = new S3Client({ region: REGION });

async function fetchReferencedKeys(): Promise<Set<string>> {
  const referenced = new Set<string>();
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const resp = await ddb.send(new ScanCommand({
      TableName: TABLE,
      ProjectionExpression: 'sourceImageKey, researchImageKey, sourceImageMaskKey',
      ExclusiveStartKey: exclusiveStartKey as never,
    }));
    for (const item of resp.Items ?? []) {
      for (const field of ['sourceImageKey', 'researchImageKey', 'sourceImageMaskKey'] as const) {
        const v = item[field]?.S;
        if (v) referenced.add(v);
      }
    }
    exclusiveStartKey = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);
  return referenced;
}

interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
}

async function listPrefix(prefix: string): Promise<S3Object[]> {
  const objects: S3Object[] = [];
  let continuationToken: string | undefined;
  do {
    const resp = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    for (const obj of resp.Contents ?? []) {
      if (obj.Key && obj.Size !== undefined && obj.LastModified) {
        objects.push({ key: obj.Key, size: obj.Size, lastModified: obj.LastModified });
      }
    }
    continuationToken = resp.NextContinuationToken;
  } while (continuationToken);
  return objects;
}

(async () => {
  console.log(`\n${confirm ? 'APPLYING' : 'DRY RUN'} — grace period ${graceHours}h\n`);

  const referenced = await fetchReferencedKeys();
  console.log(`${referenced.size} key(s) currently referenced by ${TABLE}.\n`);

  const allObjects: S3Object[] = [];
  for (const prefix of PREFIXES) {
    allObjects.push(...await listPrefix(prefix));
  }
  console.log(`${allObjects.length} object(s) found across ${PREFIXES.join(', ')}.\n`);

  const graceCutoff = new Date(Date.now() - graceHours * 60 * 60 * 1000);
  const orphans = allObjects.filter((o) => !referenced.has(o.key) && o.lastModified < graceCutoff);
  const protectedByGrace = allObjects.filter((o) => !referenced.has(o.key) && o.lastModified >= graceCutoff);

  const totalBytes = orphans.reduce((sum, o) => sum + o.size, 0);
  console.log(`${orphans.length} orphan(s) past the grace period, ${(totalBytes / 1024 / 1024).toFixed(1)} MiB.`);
  console.log(`${protectedByGrace.length} more object(s) are unreferenced but within the ${graceHours}h grace period — skipped, not counted as orphans yet.\n`);

  let deleted = 0;
  let failed = 0;
  for (const o of orphans) {
    console.log(`  ${o.key} (${(o.size / 1024).toFixed(0)} KB, ${o.lastModified.toISOString()})`);
    if (!confirm) continue;
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: o.key }));
      deleted++;
    } catch (e) {
      console.error(`    [FAILED] ${o.key}:`, e instanceof Error ? e.message : e);
      failed++;
    }
  }

  console.log(
    `\n${confirm ? 'Done.' : '(dry run — nothing deleted)'} ` +
    (confirm
      ? `Deleted ${deleted}/${orphans.length}${failed ? `, ${failed} failed` : ''}.`
      : `Would delete ${orphans.length} object(s), ${(totalBytes / 1024 / 1024).toFixed(1)} MiB.`)
  );
  if (!confirm) console.log('Re-run with --confirm to apply. (Bucket versioning + 90-day noncurrent-version lifecycle rule already in place — deletes are recoverable.)');
})();
