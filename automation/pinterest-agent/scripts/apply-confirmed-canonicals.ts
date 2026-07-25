/**
 * Apply CanonicalDesignId to every byte-identical duplicate cluster found by
 * verify-duplicate-designs-visual.ts — see docs/Focus.md Pending #13, Gap 3.
 *
 * Only acts on "confirmed-duplicate" pairs (SHA-256 byte-identical images) —
 * "worth-a-look" pairs (dHash-only match) are deliberately NOT touched here,
 * since that signal alone has a confirmed false-positive mode (see that
 * script's header). Within each group, confirmed-duplicate pairs are unioned
 * into clusters; the lowest DesignID in each cluster (size >= 2) becomes the
 * canonical target, every other member gets CanonicalDesignId set to it.
 *
 * Usage:
 *   npx tsx scripts/apply-confirmed-canonicals.ts            (dry run, prints the plan)
 *   npx tsx scripts/apply-confirmed-canonicals.ts --apply     (actually writes to DDB)
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { DynamoDBClient, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const ITEMS_TABLE = process.env.ITEMS_TABLE_NAME ?? "CrossStitchItems";
const REGION = process.env.AWS_REGION ?? "us-east-1";
const REPORT_IN = path.join(process.cwd(), "reports", "duplicate-designs-visual.json");

const client = new DynamoDBClient({ region: REGION });

interface Pair {
  a: number;
  b: number;
  classification: string;
}
interface Group {
  caption: string;
  pairs: Pair[];
}
interface VisualReport {
  groups: Group[];
}

class UnionFind {
  parent = new Map<number, number>();
  find(x: number): number {
    if (!this.parent.has(x)) this.parent.set(x, x);
    const p = this.parent.get(x)!;
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

async function findDesignKey(designId: number): Promise<{ id: string; nPage: string } | null> {
  const { Items } = await client.send(
    new QueryCommand({
      TableName: ITEMS_TABLE,
      IndexName: "DesignsByID-index",
      KeyConditionExpression: "EntityType = :entityType AND DesignID = :designId",
      ExpressionAttributeValues: { ":entityType": { S: "DESIGN" }, ":designId": { N: String(designId) } },
      Limit: 1,
    }),
  );
  const item = Items?.[0];
  if (!item?.ID?.S || !item?.NPage?.S) return null;
  return { id: item.ID.S, nPage: item.NPage.S };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const report: VisualReport = JSON.parse(fs.readFileSync(REPORT_IN, "utf8"));

  const uf = new UnionFind();
  const captionByDesign = new Map<number, string>();
  for (const g of report.groups) {
    for (const p of g.pairs) {
      if (p.classification !== "confirmed-duplicate") continue;
      uf.union(p.a, p.b);
      captionByDesign.set(p.a, g.caption);
      captionByDesign.set(p.b, g.caption);
    }
  }

  const clusters = new Map<number, number[]>();
  for (const designId of captionByDesign.keys()) {
    const root = uf.find(designId);
    const arr = clusters.get(root) ?? [];
    arr.push(designId);
    clusters.set(root, arr);
  }

  const assignments: { duplicateId: number; canonicalId: number; caption: string }[] = [];
  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    members.sort((a, b) => a - b);
    const canonicalId = members[0];
    for (const dup of members.slice(1)) {
      assignments.push({ duplicateId: dup, canonicalId, caption: captionByDesign.get(dup)! });
    }
  }

  console.log(`${clusters.size} distinct design(s) touched, ${assignments.length} canonical assignment(s) to make:\n`);
  for (const a of assignments) {
    console.log(`  ${a.caption}: design ${a.duplicateId} -> canonical ${a.canonicalId}`);
  }

  if (!apply) {
    console.log(`\nDry run only — re-run with --apply to write these to DynamoDB.`);
    return;
  }

  console.log(`\nApplying...\n`);
  let ok = 0;
  let failed = 0;
  for (const a of assignments) {
    const key = await findDesignKey(a.duplicateId);
    if (!key) {
      console.error(`  SKIP design ${a.duplicateId}: not found in ${ITEMS_TABLE}`);
      failed++;
      continue;
    }
    await client.send(
      new UpdateItemCommand({
        TableName: ITEMS_TABLE,
        Key: { ID: { S: key.id }, NPage: { S: key.nPage } },
        UpdateExpression: "SET CanonicalDesignId = :cid, LastModifiedAt = :u",
        ExpressionAttributeValues: { ":cid": { N: String(a.canonicalId) }, ":u": { S: new Date().toISOString() } },
      }),
    );
    console.log(`  OK ${a.duplicateId} -> ${a.canonicalId}`);
    ok++;
  }
  console.log(`\nDone: ${ok} applied, ${failed} skipped.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
