/**
 * One-off consistency check: compares each catalog design's DB-declared
 * metadata (Width/Height/NColors — the same fields the rendered design page
 * displays directly, so "DB" and "rendered page" are one and the same by
 * construction) against the *actual* PDF content, via the grid+palette JSON
 * already reverse-extracted from each design's real kit PDF by the
 * 2026-07-27 catalog batch-extraction job (see
 * `batch-extract-catalog-patterns.ts` / `docs/web/catalog-pattern-extraction-issues.md`).
 * Read-only — flags mismatches, writes nothing back to DDB or S3.
 *
 * Known issue class this targets: a design whose declared stitch count or
 * color count doesn't match what's actually printed in its kit PDF — this
 * class of bug produces contradicting registration/size info for anyone
 * who trusts the catalog listing over the PDF itself.
 *
 * Usage:
 *   npx tsx scripts/check-catalog-metadata-consistency.ts --limit 50
 *   npx tsx scripts/check-catalog-metadata-consistency.ts --designIds=744,406,26
 *   npx tsx scripts/check-catalog-metadata-consistency.ts --all
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { writeFileSync } from 'fs';
import { join } from 'path';

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

const args = process.argv.slice(2);
const all = args.includes('--all');
const designIdsArg = args.find((a) => a.startsWith('--designIds='))?.split('=')[1];
const explicitDesignIds = designIdsArg ? designIdsArg.split(',').map((s) => parseInt(s.trim(), 10)) : null;

function flagValue(name: string, fallback: string): string {
  const eqForm = args.find((a) => a.startsWith(`${name}=`));
  if (eqForm) return eqForm.split('=')[1];
  return fallback;
}

const limit = all ? Infinity : parseInt(flagValue('--limit', '50'), 10);
const concurrency = parseInt(flagValue('--concurrency', '8'), 10);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });

interface DesignRow {
  designId: number;
  albumId: number;
  caption: string;
  width: number;
  height: number;
  nColors: number;
  editorPatternKey?: string;
}

interface Mismatch {
  designId: number;
  albumId: number;
  caption: string;
  field: string;
  dbValue: number;
  pdfValue: number;
}

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
            ScanIndexForward: false,
            ExclusiveStartKey: exclusiveStartKey as never,
          }),
        ),
      'fetchAllDesigns page',
    );

    for (const item of resp.Items ?? []) {
      results.push({
        designId: item['DesignID'] as number,
        albumId: item['AlbumID'] as number,
        caption: (item['Caption'] as string) ?? '',
        width: (item['Width'] as number) ?? 0,
        height: (item['Height'] as number) ?? 0,
        nColors: (item['NColors'] as number) ?? 0,
        editorPatternKey: item['EditorPatternKey'] as string | undefined,
      });
    }

    exclusiveStartKey = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return results;
}

async function checkOne(design: DesignRow): Promise<Mismatch[]> {
  const mismatches: Mismatch[] = [];
  try {
    const obj = await withRetry(
      () => s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: design.editorPatternKey! })),
      `S3 fetch DesignID=${design.designId}`,
    );
    const json = await obj.Body!.transformToString();
    const pattern = JSON.parse(json) as { width: number; height: number; palette: unknown[] };

    if (design.width !== pattern.width) {
      mismatches.push({ designId: design.designId, albumId: design.albumId, caption: design.caption, field: 'Width', dbValue: design.width, pdfValue: pattern.width });
    }
    if (design.height !== pattern.height) {
      mismatches.push({ designId: design.designId, albumId: design.albumId, caption: design.caption, field: 'Height', dbValue: design.height, pdfValue: pattern.height });
    }
    if (design.nColors !== pattern.palette.length) {
      mismatches.push({ designId: design.designId, albumId: design.albumId, caption: design.caption, field: 'NColors', dbValue: design.nColors, pdfValue: pattern.palette.length });
    }
  } catch (e) {
    console.warn(`  [error] DesignID=${design.designId} — ${(e as Error).message}`);
  }
  return mismatches;
}

(async () => {
  console.log(`\nCatalog metadata consistency check  ${explicitDesignIds ? `designIds=${explicitDesignIds.join(',')}` : `limit=${limit === Infinity ? 'all' : limit}`}  concurrency=${concurrency}`);

  const all_ = await fetchAllDesigns();
  const withPattern = all_.filter((d) => !!d.editorPatternKey);
  console.log(`  ${all_.length} total designs, ${withPattern.length} have an extracted pattern (checkable)`);

  let checkSet = withPattern;
  if (explicitDesignIds) {
    checkSet = explicitDesignIds
      .map((id) => withPattern.find((r) => r.designId === id))
      .filter((r): r is DesignRow => !!r);
  } else if (limit !== Infinity) {
    checkSet = withPattern.slice(0, limit);
  }
  console.log(`  Checking ${checkSet.length} design(s)\n`);

  const allMismatches: Mismatch[] = [];
  let checked = 0;
  for (let i = 0; i < checkSet.length; i += concurrency) {
    const chunk = checkSet.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map(checkOne));
    for (const r of results) allMismatches.push(...r);
    checked += chunk.length;
    console.log(`  --- ${checked}/${checkSet.length} checked, ${allMismatches.length} mismatch(es) so far ---`);
  }

  console.log(`\nDone. Checked ${checked} designs, found ${allMismatches.length} mismatch(es) across ${new Set(allMismatches.map((m) => m.designId)).size} design(s).`);

  if (allMismatches.length) {
    const lines = [
      '# Catalog metadata consistency-check results',
      '',
      `Generated ${new Date().toISOString().slice(0, 10)}. Compares DB-declared Width/Height/NColors`,
      '(the same fields the design page displays) against the actual PDF content, via the',
      'grid+palette JSON already extracted by the catalog batch-extraction job.',
      '',
      `Checked ${checked} designs, found ${allMismatches.length} mismatch(es) across ${new Set(allMismatches.map((m) => m.designId)).size} design(s).`,
      '',
      '| DesignID | AlbumID | Caption | Field | DB value | Actual PDF value |',
      '|---|---|---|---|---|---|',
      ...allMismatches.map(
        (m) => `| ${m.designId} | ${m.albumId} | ${m.caption} | ${m.field} | ${m.dbValue} | ${m.pdfValue} |`,
      ),
      '',
    ];
    // Resolve relative to this script's own location, not the process cwd —
    // this script lives in web/scripts/, and docs/ is a sibling of web/.
    const outPath = join(__dirname, '..', '..', 'docs', 'web', 'catalog-metadata-consistency-issues.md');
    try {
      writeFileSync(outPath, lines.join('\n'));
      console.log(`Report written to ${outPath}`);
    } catch (e) {
      console.log(`(could not write report file: ${(e as Error).message})`);
    }
  }
})();
