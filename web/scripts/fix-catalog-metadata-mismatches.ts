/**
 * Fixes the 32 designs flagged by check-catalog-metadata-consistency.ts
 * (2026-07-28 run, docs/web/catalog-metadata-consistency-issues.md): sets
 * DDB Width/Height/NColors to the actual value found in each design's kit
 * PDF (via its already-extracted grid+palette JSON) — the PDF is what
 * customers actually receive, so it's ground truth over the catalog
 * listing. Only touches fields that were actually flagged as mismatched;
 * fields not flagged for a given design are left untouched.
 *
 * Defaults to a dry run (prints old -> new per field, writes nothing).
 * Pass --confirm to actually write to DDB.
 *
 * Usage:
 *   npx tsx scripts/fix-catalog-metadata-mismatches.ts            # dry run
 *   npx tsx scripts/fix-catalog-metadata-mismatches.ts --confirm  # apply
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ITEMS_TABLE = process.env.ITEMS_TABLE_NAME ?? 'CrossStitchItems';
const REGION = process.env.AWS_REGION ?? 'us-east-1';

const confirm = process.argv.includes('--confirm');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

interface Mismatch {
  designId: number;
  albumId: number;
  caption: string;
  field: 'Width' | 'Height' | 'NColors';
  dbValue: number;
  pdfValue: number;
}

// From docs/web/catalog-metadata-consistency-issues.md (full run, 2026-07-28)
const mismatches: Mismatch[] = [
  { designId: 4218, albumId: 58, caption: 'Woman', field: 'Height', dbValue: 10, pdfValue: 106 },
  { designId: 4218, albumId: 58, caption: 'Woman', field: 'NColors', dbValue: 10, pdfValue: 12 },
  { designId: 3158, albumId: 36, caption: 'Blue Mosque', field: 'Width', dbValue: 318, pdfValue: 239 },
  { designId: 3158, albumId: 36, caption: 'Blue Mosque', field: 'Height', dbValue: 239, pdfValue: 159 },
  { designId: 3158, albumId: 36, caption: 'Blue Mosque', field: 'NColors', dbValue: 49, pdfValue: 30 },
  { designId: 2887, albumId: 14, caption: 'Candles', field: 'Width', dbValue: 92, pdfValue: 94 },
  { designId: 2887, albumId: 14, caption: 'Candles', field: 'Height', dbValue: 100, pdfValue: 102 },
  { designId: 2887, albumId: 14, caption: 'Candles', field: 'NColors', dbValue: 28, pdfValue: 29 },
  { designId: 2861, albumId: 104, caption: 'Cushion Cover', field: 'Width', dbValue: 200, pdfValue: 169 },
  { designId: 2861, albumId: 104, caption: 'Cushion Cover', field: 'Height', dbValue: 200, pdfValue: 169 },
  { designId: 2861, albumId: 104, caption: 'Cushion Cover', field: 'NColors', dbValue: 16, pdfValue: 13 },
  { designId: 2860, albumId: 16, caption: 'Horse', field: 'NColors', dbValue: 29, pdfValue: 12 },
  { designId: 2851, albumId: 54, caption: 'Good Night', field: 'Height', dbValue: 104, pdfValue: 105 },
  { designId: 2851, albumId: 54, caption: 'Good Night', field: 'NColors', dbValue: 23, pdfValue: 20 },
  { designId: 2847, albumId: 29, caption: 'Grapes', field: 'Width', dbValue: 137, pdfValue: 121 },
  { designId: 2847, albumId: 29, caption: 'Grapes', field: 'Height', dbValue: 125, pdfValue: 138 },
  { designId: 2847, albumId: 29, caption: 'Grapes', field: 'NColors', dbValue: 23, pdfValue: 28 },
  { designId: 2841, albumId: 37, caption: 'Polar Bear Cubs', field: 'NColors', dbValue: 20, pdfValue: 28 },
  { designId: 2838, albumId: 37, caption: 'African Wild Dog', field: 'NColors', dbValue: 17, pdfValue: 16 },
  { designId: 2609, albumId: 15, caption: 'Cat', field: 'Width', dbValue: 161, pdfValue: 169 },
  { designId: 2609, albumId: 15, caption: 'Cat', field: 'Height', dbValue: 119, pdfValue: 113 },
  { designId: 2609, albumId: 15, caption: 'Cat', field: 'NColors', dbValue: 6, pdfValue: 30 },
  { designId: 2497, albumId: 66, caption: 'Perfume', field: 'Width', dbValue: 96, pdfValue: 95 },
  { designId: 2453, albumId: 37, caption: 'Mouse', field: 'Width', dbValue: 129, pdfValue: 225 },
  { designId: 2453, albumId: 37, caption: 'Mouse', field: 'Height', dbValue: 75, pdfValue: 169 },
  { designId: 2453, albumId: 37, caption: 'Mouse', field: 'NColors', dbValue: 29, pdfValue: 50 },
  { designId: 2450, albumId: 37, caption: 'Fallow Deer', field: 'Width', dbValue: 207, pdfValue: 129 },
  { designId: 2450, albumId: 37, caption: 'Fallow Deer', field: 'Height', dbValue: 183, pdfValue: 75 },
  { designId: 2450, albumId: 37, caption: 'Fallow Deer', field: 'NColors', dbValue: 30, pdfValue: 29 },
  { designId: 2386, albumId: 17, caption: 'Camomiles', field: 'Width', dbValue: 120, pdfValue: 138 },
  { designId: 2386, albumId: 17, caption: 'Camomiles', field: 'Height', dbValue: 119, pdfValue: 138 },
  { designId: 2386, albumId: 17, caption: 'Camomiles', field: 'NColors', dbValue: 28, pdfValue: 30 },
  { designId: 2278, albumId: 17, caption: 'Flowers', field: 'NColors', dbValue: 0, pdfValue: 23 },
  { designId: 2269, albumId: 6, caption: 'Squares', field: 'NColors', dbValue: 0, pdfValue: 30 },
  { designId: 2268, albumId: 14, caption: 'Motion', field: 'NColors', dbValue: 0, pdfValue: 29 },
  { designId: 2266, albumId: 17, caption: 'Carnation', field: 'NColors', dbValue: 0, pdfValue: 26 },
  { designId: 2157, albumId: 14, caption: 'Medical symbols', field: 'Height', dbValue: 114, pdfValue: 118 },
  { designId: 2150, albumId: 17, caption: 'Branch in Bloom', field: 'NColors', dbValue: 27, pdfValue: 28 },
  { designId: 1980, albumId: 28, caption: 'Barcelona', field: 'Width', dbValue: 133, pdfValue: 103 },
  { designId: 1980, albumId: 28, caption: 'Barcelona', field: 'Height', dbValue: 136, pdfValue: 96 },
  { designId: 1980, albumId: 28, caption: 'Barcelona', field: 'NColors', dbValue: 8, pdfValue: 12 },
  { designId: 1626, albumId: 40, caption: 'Saint  Kateria Tekakwitha', field: 'NColors', dbValue: 0, pdfValue: 29 },
  { designId: 1625, albumId: 8, caption: 'Panama Canal', field: 'NColors', dbValue: 24, pdfValue: 29 },
  { designId: 1593, albumId: 35, caption: 'Christmas Card', field: 'Width', dbValue: 82, pdfValue: 60 },
  { designId: 1593, albumId: 35, caption: 'Christmas Card', field: 'Height', dbValue: 116, pdfValue: 70 },
  { designId: 1593, albumId: 35, caption: 'Christmas Card', field: 'NColors', dbValue: 29, pdfValue: 13 },
  { designId: 1241, albumId: 17, caption: 'Flowers', field: 'NColors', dbValue: 0, pdfValue: 6 },
  { designId: 352, albumId: 8, caption: 'Desert Sunset', field: 'NColors', dbValue: 45, pdfValue: 3 },
  { designId: 349, albumId: 8, caption: 'Winter', field: 'NColors', dbValue: 48, pdfValue: 6 },
  { designId: 345, albumId: 40, caption: 'Jesus with Children', field: 'NColors', dbValue: 47, pdfValue: 5 },
  { designId: 313, albumId: 36, caption: 'Khana-e-kaba', field: 'NColors', dbValue: 49, pdfValue: 7 },
  { designId: 312, albumId: 36, caption: 'El -Aktza', field: 'NColors', dbValue: 50, pdfValue: 8 },
  { designId: 311, albumId: 36, caption: 'Blue Mosque', field: 'NColors', dbValue: 50, pdfValue: 8 },
  { designId: 292, albumId: 32, caption: 'Indian Woman', field: 'NColors', dbValue: 44, pdfValue: 2 },
];

interface DesignKey {
  id: string;
  nPage: number;
}

async function fetchKeysByDesignId(designIds: Set<number>): Promise<Map<number, DesignKey>> {
  const map = new Map<number, DesignKey>();
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const resp = await ddb.send(
      new QueryCommand({
        TableName: ITEMS_TABLE,
        IndexName: 'DesignsByID-index',
        KeyConditionExpression: 'EntityType = :et',
        ExpressionAttributeValues: { ':et': 'DESIGN' },
        ScanIndexForward: false,
        ExclusiveStartKey: exclusiveStartKey as never,
      }),
    );
    for (const item of resp.Items ?? []) {
      const designId = item['DesignID'] as number;
      if (designIds.has(designId)) {
        map.set(designId, { id: item['ID'] as string, nPage: item['NPage'] as number });
      }
    }
    exclusiveStartKey = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);
  return map;
}

(async () => {
  const byDesign = new Map<number, Mismatch[]>();
  for (const m of mismatches) {
    if (!byDesign.has(m.designId)) byDesign.set(m.designId, []);
    byDesign.get(m.designId)!.push(m);
  }

  console.log(`\n${confirm ? 'APPLYING' : 'DRY RUN'} — ${byDesign.size} designs, ${mismatches.length} field(s) to fix\n`);

  const keys = await fetchKeysByDesignId(new Set(byDesign.keys()));

  let applied = 0;
  let missing = 0;
  for (const [designId, fields] of byDesign) {
    const key = keys.get(designId);
    const label = `DesignID=${designId} "${fields[0].caption}"`;
    if (!key) {
      console.warn(`  [skip] ${label} — not found in DDB (deleted since the 07-28 scan?)`);
      missing++;
      continue;
    }

    const changes = fields.map((f) => `${f.field}: ${f.dbValue} -> ${f.pdfValue}`).join(', ');
    console.log(`  ${label} — ${changes}`);

    if (confirm) {
      const names: Record<string, string> = {};
      const values: Record<string, number> = {};
      const setParts: string[] = [];
      fields.forEach((f, i) => {
        names[`#f${i}`] = f.field;
        values[`:v${i}`] = f.pdfValue;
        setParts.push(`#f${i} = :v${i}`);
      });
      await ddb.send(
        new UpdateCommand({
          TableName: ITEMS_TABLE,
          Key: { ID: key.id, NPage: key.nPage },
          UpdateExpression: `SET ${setParts.join(', ')}`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        }),
      );
      applied++;
    }
  }

  console.log(`\n${confirm ? 'Done.' : '(dry run — nothing written)'} ${confirm ? `Updated ${applied} design(s).` : `Would update ${byDesign.size - missing} design(s).`}${missing ? ` ${missing} not found.` : ''}`);
  if (!confirm) console.log('Re-run with --confirm to apply.');
})();
