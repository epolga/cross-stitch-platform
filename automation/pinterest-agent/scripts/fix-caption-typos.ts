/**
 * One-off fix for a batch of Caption typos found 2026-07-27 via
 * scripts/_find_caption_typos.ts (edit-distance clustering across all
 * distinct catalog Captions) and verified against each design's own
 * SeoTitle/SeoDescription (AI-generated from the actual product photo,
 * so a reliable independent check of what the design actually depicts).
 *
 * Usage:
 *   npx tsx scripts/fix-caption-typos.ts --dry-run   (default)
 *   npx tsx scripts/fix-caption-typos.ts --apply
 */
import "dotenv/config";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const TABLE = process.env.ITEMS_TABLE_NAME ?? "CrossStitchItems";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" }));
const APPLY = process.argv.includes("--apply");

const FIXES: Record<string, string> = {
  Graffe: "Giraffe",
  Bannny: "Bunny",
  Banny: "Bunny",
  "Smal Rose": "Small Rose",
  Baloons: "Balloons",
  Elefant: "Elephant",
  Kangoroos: "Kangaroo",
  Snoflake: "Snowflake",
  Butterfliy: "Butterfly",
  "Indian Gril": "Indian Girl",
  "Merry Cristmas": "Merry Christmas",
  "Marry Christmas": "Merry Christmas",
  "Mapple Leave": "Maple Leaf",
  Dolpin: "Dolphin",
  Dolphyn: "Dolphin",
  Cartations: "Carnations",
  carnation: "Carnation",
};

async function main() {
  console.log(APPLY ? "MODE: --apply" : "MODE: dry-run (pass --apply to write)");
  let lastKey: Record<string, unknown> | undefined;
  let fixed = 0;

  do {
    const res: any = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: "EntityType = :e",
      ExpressionAttributeValues: { ":e": "DESIGN" },
      ProjectionExpression: "#id, NPage, DesignID, Caption",
      ExpressionAttributeNames: { "#id": "ID" },
      ExclusiveStartKey: lastKey,
    }));

    for (const row of res.Items || []) {
      const target = FIXES[row.Caption];
      if (!target) continue;
      fixed++;
      console.log(`  DesignID ${row.DesignID}: "${row.Caption}" -> "${target}"`);
      if (APPLY) {
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { ID: row.ID, NPage: row.NPage },
          UpdateExpression: "SET Caption = :c",
          ExpressionAttributeValues: { ":c": target },
        }));
      }
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  console.log(`\nTotal fixed: ${fixed}`);
  if (!APPLY) console.log("Dry run only — re-run with --apply to write.");
}
main().catch(e => { console.error(e); process.exit(1); });
