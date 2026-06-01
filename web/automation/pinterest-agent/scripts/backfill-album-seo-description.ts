/**
 * Generate and store SeoDescription for album records in CrossStitchItems.
 *
 * Albums are small (~114 total) so --all is the sensible default.
 *
 * Usage:
 *   npx tsx scripts/backfill-album-seo-description.ts             # all albums
 *   npx tsx scripts/backfill-album-seo-description.ts --dry-run   # preview only
 *   npx tsx scripts/backfill-album-seo-description.ts --concurrency 5
 */

import dotenv from "dotenv";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const ITEMS_TABLE = process.env.ITEMS_TABLE_NAME ?? "CrossStitchItems";
const REGION = process.env.AWS_REGION ?? "us-east-1";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skipExisting = !args.includes("--overwrite");
const concurrencyArg = args.find((a) => a.startsWith("--concurrency=") || a === "--concurrency");
const concurrency = concurrencyArg
  ? parseInt(args[args.indexOf("--concurrency") + 1] ?? concurrencyArg.split("=")[1] ?? "3", 10)
  : 3;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

interface AlbumRow {
  id: string;
  nPage: string;
  albumId: number;
  caption: string;
  hasSeoDescription: boolean;
}

async function fetchAllAlbums(): Promise<AlbumRow[]> {
  const albums: AlbumRow[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const resp = await ddb.send(
      new ScanCommand({
        TableName: ITEMS_TABLE,
        FilterExpression: "EntityType = :albumType",
        ExpressionAttributeValues: { ":albumType": "ALBUM" },
        ProjectionExpression: "ID, NPage, AlbumID, Caption, SeoDescription",
        ExclusiveStartKey: exclusiveStartKey as never,
      }),
    );

    for (const item of resp.Items ?? []) {
      const albumId = item["AlbumID"] as number;
      const caption = item["Caption"] as string;
      if (!albumId || !caption) continue;

      albums.push({
        id: item["ID"] as string,
        nPage: item["NPage"] as string,
        albumId,
        caption,
        hasSeoDescription: !!item["SeoDescription"],
      });
    }

    exclusiveStartKey = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return albums.sort((a, b) => b.albumId - a.albumId);
}

async function generateSeoDescription(caption: string): Promise<string> {
  const prompt = `Write an SEO description for a free cross-stitch pattern collection page.

Album name: ${caption}

Instructions:
- Write exactly 2 paragraphs totalling 150-200 words
- Paragraph 1: describe the ${caption} theme in cross-stitch — what subjects, moods, and stitching experiences these patterns offer; be specific to this theme
- Paragraph 2: practical details — free printable PDF charts with complete DMC color keys, instant downloads, suits beginner through experienced stitchers, works on standard Aida fabric
- Use cross-stitch vocabulary naturally: counted cross stitch, Aida, DMC threads, needlework, embroidery, PDF chart
- Do NOT start with: "This collection", "Welcome to", "This album", "This curated"
- Output only the two paragraphs, no markdown, no headings`;

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  return text;
}

async function writeSeoDescription(album: AlbumRow, text: string): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: ITEMS_TABLE,
      Key: { ID: album.id, NPage: album.nPage },
      UpdateExpression: "SET SeoDescription = :seo",
      ExpressionAttributeValues: { ":seo": text },
    }),
  );
}

async function processOne(album: AlbumRow): Promise<"ok" | "skip"> {
  if (skipExisting && album.hasSeoDescription) {
    console.log(`  [skip] AlbumID=${album.albumId}  "${album.caption}" — already has SeoDescription`);
    return "skip";
  }

  console.log(`  [gen]  AlbumID=${album.albumId}  "${album.caption}"`);
  const text = await generateSeoDescription(album.caption);
  console.log(`         ${text.length} chars  "${text.slice(0, 90)}..."`);

  if (!dryRun) {
    await writeSeoDescription(album, text);
    console.log(`         ✓ written to DDB`);
  } else {
    console.log(`         (dry-run — not written)`);
  }
  return "ok";
}

(async () => {
  console.log(`\nBackfill album SeoDescription  concurrency=${concurrency}  dryRun=${dryRun}  skipExisting=${skipExisting}`);

  if (!ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY not set in .env");
    process.exit(1);
  }

  const albums = await fetchAllAlbums();
  console.log(`  Found ${albums.length} album(s)\n`);

  let ok = 0, skipped = 0;

  for (let i = 0; i < albums.length; i += concurrency) {
    const chunk = albums.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map(processOne));
    results.forEach(r => r === "ok" ? ok++ : skipped++);
    console.log(`  --- ${Math.min(i + concurrency, albums.length)}/${albums.length} done ---\n`);
  }

  console.log(`\nDone. generated=${ok}  skipped=${skipped}`);
})();
