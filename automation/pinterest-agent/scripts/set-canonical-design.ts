/**
 * Set (or clear) CanonicalDesignId on a DESIGN row — see docs/Focus.md
 * Pending #13, Gap 3. Points a near-duplicate design's <link rel="canonical">
 * at the primary design instead of itself; the duplicate page still renders
 * normally, only the SEO canonical target changes (web/src/app/designs/
 * [designId]/page.tsx generateMetadata reads this field).
 *
 * Usage:
 *   npx tsx scripts/set-canonical-design.ts <duplicateDesignId> <canonicalDesignId>
 *   npx tsx scripts/set-canonical-design.ts <duplicateDesignId> --clear
 */

import path from "path";
import dotenv from "dotenv";
import { DynamoDBClient, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const ITEMS_TABLE = process.env.ITEMS_TABLE_NAME ?? "CrossStitchItems";
const REGION = process.env.AWS_REGION ?? "us-east-1";

const client = new DynamoDBClient({ region: REGION });

async function findDesignKey(designId: number): Promise<{ id: string; nPage: string } | null> {
  const { Items } = await client.send(
    new QueryCommand({
      TableName: ITEMS_TABLE,
      IndexName: "DesignsByID-index",
      KeyConditionExpression: "EntityType = :entityType AND DesignID = :designId",
      ExpressionAttributeValues: {
        ":entityType": { S: "DESIGN" },
        ":designId": { N: String(designId) },
      },
      Limit: 1,
    }),
  );
  const item = Items?.[0];
  if (!item?.ID?.S || !item?.NPage?.S) return null;
  return { id: item.ID.S, nPage: item.NPage.S };
}

async function main() {
  const [dupArg, canonicalArg] = process.argv.slice(2);
  const duplicateDesignId = parseInt(dupArg, 10);

  if (!Number.isFinite(duplicateDesignId) || !canonicalArg) {
    console.error("Usage: npx tsx scripts/set-canonical-design.ts <duplicateDesignId> <canonicalDesignId|--clear>");
    process.exit(1);
  }

  const key = await findDesignKey(duplicateDesignId);
  if (!key) {
    console.error(`Design ${duplicateDesignId} not found in ${ITEMS_TABLE}.`);
    process.exit(1);
  }

  if (canonicalArg === "--clear") {
    await client.send(
      new UpdateItemCommand({
        TableName: ITEMS_TABLE,
        Key: { ID: { S: key.id }, NPage: { S: key.nPage } },
        UpdateExpression: "REMOVE CanonicalDesignId",
      }),
    );
    console.log(`Cleared CanonicalDesignId on design ${duplicateDesignId}.`);
    return;
  }

  const canonicalDesignId = parseInt(canonicalArg, 10);
  if (!Number.isFinite(canonicalDesignId)) {
    console.error(`Invalid canonicalDesignId: ${canonicalArg}`);
    process.exit(1);
  }
  if (canonicalDesignId === duplicateDesignId) {
    console.error("duplicateDesignId and canonicalDesignId must differ.");
    process.exit(1);
  }

  const canonicalKey = await findDesignKey(canonicalDesignId);
  if (!canonicalKey) {
    console.error(`Canonical target design ${canonicalDesignId} not found in ${ITEMS_TABLE} — refusing to point at a non-existent design.`);
    process.exit(1);
  }

  await client.send(
    new UpdateItemCommand({
      TableName: ITEMS_TABLE,
      Key: { ID: { S: key.id }, NPage: { S: key.nPage } },
      UpdateExpression: "SET CanonicalDesignId = :cid",
      ExpressionAttributeValues: { ":cid": { N: String(canonicalDesignId) } },
    }),
  );
  console.log(`Design ${duplicateDesignId} now canonicalizes to design ${canonicalDesignId}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
