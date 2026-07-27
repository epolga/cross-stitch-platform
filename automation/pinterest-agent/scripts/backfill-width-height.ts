/**
 * Backfill Width/Height for catalog designs where the stored values were
 * corrupted (Height duplicated from Width) at upload time.
 *
 * Found 2026-07-27: of 5271 DESIGN rows, 5188 (98.4%) have Width === Height
 * in DynamoDB, and 4399 (83.5% of the whole catalog) of those disagree with
 * the real dimensions embedded as literal text in the Description field
 * (e.g. "115 x 167 stitches 29 colors" — extracted directly from the PDF at
 * upload time, same field PatternInfo.cs writes and never affected by this
 * bug). Description is authoritative; Width/Height are not.
 *
 * This also corrects a handful of known Caption typos found the same day
 * ("Balerina" -> "Ballerina") while already scanning the whole table.
 *
 * Usage:
 *   npx tsx scripts/backfill-width-height.ts --dry-run   (default: reports only, writes nothing)
 *   npx tsx scripts/backfill-width-height.ts --apply      (writes the corrections)
 */
import "dotenv/config";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const TABLE = process.env.ITEMS_TABLE_NAME ?? "CrossStitchItems";
const REGION = process.env.AWS_REGION ?? "us-east-1";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const APPLY = process.argv.includes("--apply");

const CAPTION_FIXES: Record<string, string> = {
  Balerina: "Ballerina",
};

interface Row {
  ID: string;
  NPage: string;
  DesignID: number;
  Caption: string;
  Width?: number;
  Height?: number;
  Description?: string;
}

async function scanAllDesigns(): Promise<Row[]> {
  const rows: Row[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res: any = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: "EntityType = :e",
      ExpressionAttributeValues: { ":e": "DESIGN" },
      ProjectionExpression: "#id, NPage, DesignID, Caption, Width, #h, Description",
      ExpressionAttributeNames: { "#id": "ID", "#h": "Height" },
      ExclusiveStartKey: lastKey,
    }));
    rows.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return rows;
}

async function main() {
  console.log(APPLY ? "MODE: --apply (writing changes)" : "MODE: dry-run (no writes — pass --apply to write)");

  const rows = await scanAllDesigns();
  console.log(`Scanned ${rows.length} DESIGN rows.`);

  let sizeFixes = 0;
  let captionFixes = 0;
  let errors = 0;

  for (const row of rows) {
    const updates: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};

    // --- Width/Height fix ---
    if (row.Description && row.Width != null && row.Height != null && row.Width === row.Height) {
      const m = row.Description.match(/(\d+)\s*x\s*(\d+)\s*stitches/i);
      if (m) {
        const descW = parseInt(m[1], 10);
        const descH = parseInt(m[2], 10);
        if (descH !== row.Height || descW !== row.Width) {
          names["#w"] = "Width";
          names["#h"] = "Height";
          values[":w"] = descW;
          values[":h"] = descH;
          updates.push("#w = :w", "#h = :h");
          sizeFixes++;
        }
      }
    }

    // --- Caption typo fix ---
    if (row.Caption && CAPTION_FIXES[row.Caption]) {
      names["#c"] = "Caption";
      values[":c"] = CAPTION_FIXES[row.Caption];
      updates.push("#c = :c");
      captionFixes++;
    }

    if (updates.length === 0) continue;

    if (APPLY) {
      try {
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { ID: row.ID, NPage: row.NPage },
          UpdateExpression: `SET ${updates.join(", ")}`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        }));
      } catch (err) {
        errors++;
        console.error(`  FAILED DesignID ${row.DesignID} (ID=${row.ID}, NPage=${row.NPage}):`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log(`\nWidth/Height corrections: ${sizeFixes}`);
  console.log(`Caption corrections: ${captionFixes}`);
  if (APPLY) console.log(`Errors: ${errors}`);
  if (!APPLY) console.log("\nDry run only — re-run with --apply to write these changes.");
}
main().catch(e => { console.error(e); process.exit(1); });
