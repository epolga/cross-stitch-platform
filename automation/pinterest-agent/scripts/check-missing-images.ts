/**
 * Identify designs whose CloudFront image returns a non-200 status.
 * Checks all designs in DDB by default, or a specific list of IDs via --ids flag.
 *
 * Usage:
 *   npx tsx scripts/check-missing-images.ts
 *   npx tsx scripts/check-missing-images.ts --ids 764,1062,1064,1075,1115,2472,2510,3534,4262
 */

import dotenv from "dotenv";
import path from "path";
import https from "https";
dotenv.config({ path: path.join(process.cwd(), ".env") });

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const ITEMS_TABLE = process.env.ITEMS_TABLE_NAME ?? "CrossStitchItems";
const CLOUDFRONT_BASE = "https://d2o1uvvg91z7o4.cloudfront.net";
const CONCURRENCY = 20;

const args = process.argv.slice(2);
const idsArg = args.find(a => a.startsWith("--ids=") || a === "--ids");
const specificIds: number[] = idsArg
  ? (idsArg.startsWith("--ids=")
      ? idsArg.slice(6)
      : args[args.indexOf("--ids") + 1]
    ).split(",").map(Number)
  : [];

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

interface Design {
  designId: number;
  albumId: number;
  caption: string;
  imageUrl: string;
}

async function fetchDesigns(): Promise<Design[]> {
  const designs: Design[] = [];
  let lastKey: Record<string, unknown> | undefined;
  process.stdout.write("Loading designs");
  do {
    const resp = await ddb.send(new ScanCommand({
      TableName: ITEMS_TABLE,
      FilterExpression: "EntityType = :t",
      ExpressionAttributeValues: { ":t": "DESIGN" },
      ProjectionExpression: "DesignID, AlbumID, Caption, ImageUrl",
      ExclusiveStartKey: lastKey,
    }));
    for (const item of resp.Items ?? []) {
      const designId = Number(item.DesignID);
      if (!designId) continue;
      if (specificIds.length > 0 && !specificIds.includes(designId)) continue;
      const albumId = Number(item.AlbumID);
      designs.push({
        designId,
        albumId,
        caption: String(item.Caption ?? ""),
        imageUrl: item.ImageUrl
          ? String(item.ImageUrl)
          : `${CLOUDFRONT_BASE}/photos/${albumId}/${designId}/4.jpg`,
      });
    }
    lastKey = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
    process.stdout.write(".");
  } while (lastKey);
  console.log(` ${designs.length} designs`);
  return designs;
}

function checkUrl(url: string): Promise<number> {
  return new Promise(resolve => {
    const req = https.get(url, { method: "HEAD", timeout: 10000 }, res => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", () => resolve(0));
    req.on("timeout", () => { req.destroy(); resolve(0); });
  });
}

async function checkBatch(designs: Design[]): Promise<{ design: Design; status: number }[]> {
  return Promise.all(designs.map(async d => ({ design: d, status: await checkUrl(d.imageUrl) })));
}

async function main() {
  const designs = await fetchDesigns();
  const broken: { design: Design; status: number }[] = [];
  let checked = 0;

  for (let i = 0; i < designs.length; i += CONCURRENCY) {
    const batch = designs.slice(i, i + CONCURRENCY);
    const results = await checkBatch(batch);
    for (const r of results) {
      if (r.status !== 200) broken.push(r);
    }
    checked += batch.length;
    if (checked % 500 === 0 || checked === designs.length) {
      process.stdout.write(`\rChecked ${checked}/${designs.length} | broken: ${broken.length}   `);
    }
  }

  console.log(`\n\nBroken images (${broken.length}):\n`);
  console.log("DesignID\tAlbumID\tStatus\tCaption\tURL");
  for (const { design, status } of broken.sort((a, b) => a.design.designId - b.design.designId)) {
    console.log(`${design.designId}\t${design.albumId}\t${status}\t${design.caption}\t${design.imageUrl}`);
  }

  if (broken.length > 0) {
    console.log("\nNext steps:");
    console.log("  - Check if the image file exists in S3 at the expected path");
    console.log("  - Re-upload the image via the WPF Uploader");
    console.log("  - Or update the ImageUrl field in DDB if the image is at a different path");
  }
}

main().catch(err => { console.error(err); process.exit(1); });
