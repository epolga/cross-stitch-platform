/**
 * Backfill SeoDescription for designs that don't have one yet.
 *
 * By default processes only the design with the highest DesignID (--limit 1).
 * Pass --limit N to process more, or --all to process every design without one.
 *
 * Usage:
 *   npx tsx scripts/backfill-seo-description.ts            # latest design only
 *   npx tsx scripts/backfill-seo-description.ts --limit 10
 *   npx tsx scripts/backfill-seo-description.ts --all
 *   npx tsx scripts/backfill-seo-description.ts --dry-run   # preview without writing
 */

import dotenv from "dotenv";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

dotenv.config({ path: path.join(process.cwd(), ".env") });

// ── Config ────────────────────────────────────────────────────────────────────

const ITEMS_TABLE = process.env.ITEMS_TABLE_NAME ?? "CrossStitchItems";
const REGION = process.env.AWS_REGION ?? "us-east-1";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const all = args.includes("--all");
const limitArg = args.find((a) => a.startsWith("--limit=") || a === "--limit");
const limit = all ? Infinity : limitArg
  ? parseInt(args[args.indexOf("--limit") + 1] ?? limitArg.split("=")[1] ?? "1", 10)
  : 1;
const concurrencyArg = args.find((a) => a.startsWith("--concurrency=") || a === "--concurrency");
const concurrency = concurrencyArg
  ? parseInt(args[args.indexOf("--concurrency") + 1] ?? concurrencyArg.split("=")[1] ?? "1", 10)
  : 1;

// ── DynamoDB ──────────────────────────────────────────────────────────────────

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

interface DesignRow {
  id: string;
  nPage: string;
  designId: number;
  albumId: number;
  caption: string;
  description: string;
  notes: string;
  width: number;
  height: number;
  nColors: number;
  hasSeoDescription: boolean;
}

async function fetchLatestDesigns(take: number): Promise<DesignRow[]> {
  const results: DesignRow[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const resp = await ddb.send(
      new QueryCommand({
        TableName: ITEMS_TABLE,
        IndexName: "DesignsByID-index",
        KeyConditionExpression: "EntityType = :et",
        ExpressionAttributeValues: { ":et": "DESIGN" },
        ScanIndexForward: false, // DESC by DesignID — newest first
        Limit: Math.min(take * 3, 100), // over-fetch to account for already-backfilled
        ExclusiveStartKey: exclusiveStartKey as never,
      }),
    );

    for (const item of resp.Items ?? []) {
      if (results.length >= take) break;
      const hasSeo = !!item["SeoDescription"];
      if (all && hasSeo) continue; // skip already-done when running --all
      results.push({
        id: item["ID"] as string,
        nPage: item["NPage"] as string,
        designId: item["DesignID"] as number,
        albumId: item["AlbumID"] as number,
        caption: item["Caption"] as string ?? "",
        description: item["Description"] as string ?? "",
        notes: item["Notes"] as string ?? "",
        width: item["Width"] as number ?? 0,
        height: item["Height"] as number ?? 0,
        nColors: item["NColors"] as number ?? 0,
        hasSeoDescription: hasSeo,
      });
    }

    exclusiveStartKey = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
    if (results.length >= take) break;
  } while (exclusiveStartKey);

  return results;
}

async function getAlbumCaption(albumId: number): Promise<string> {
  try {
    const resp = await ddb.send(
      new QueryCommand({
        TableName: ITEMS_TABLE,
        KeyConditionExpression: "ID = :pk",
        FilterExpression: "EntityType = :albumType",
        ExpressionAttributeValues: {
          ":pk": `ALB#${String(albumId).padStart(4, "0")}`,
          ":albumType": "ALBUM",
        },
        ProjectionExpression: "Caption",
        Limit: 1,
      }),
    );
    return (resp.Items?.[0]?.["Caption"] as string) ?? "";
  } catch {
    return "";
  }
}

async function writeSeoDescription(design: DesignRow, text: string): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: ITEMS_TABLE,
      Key: { ID: design.id, NPage: design.nPage },
      UpdateExpression: "SET SeoDescription = :seo",
      ExpressionAttributeValues: { ":seo": text },
    }),
  );
}

// ── Claude ────────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

function skillLevel(width: number, height: number, nColors: number): string {
  const small = width > 0 && width < 80 && height > 0 && height < 80;
  const large = width > 150 || height > 150;
  if (small && nColors < 10) return "beginner";
  if (large || nColors > 30) return "advanced";
  return "intermediate";
}

async function generateSeoDescription(design: DesignRow, albumCaption: string): Promise<string> {
  const size = design.width > 0 && design.height > 0
    ? `${design.width} × ${design.height} stitches`
    : "compact";
  const colors = design.nColors > 0 ? `${design.nColors} DMC thread colors` : "a curated thread palette";
  const level = skillLevel(design.width, design.height, design.nColors);

  const prompt = `Write an SEO description for this free cross-stitch pattern page.

Design title: ${design.caption}
Category: ${albumCaption || "Cross Stitch"}
Stitch count: ${size}
Colors: ${colors}
Skill level: ${level}

Instructions:
- Write exactly 2 paragraphs totalling 150-200 words
- Open with a sentence specific to this design (mention the title and what makes the subject interesting to stitch)
- Paragraph 1: describe the design and stitching experience (mention the stitch count and color count naturally)
- Paragraph 2: practical details — skill level, that it is a free printable PDF chart with DMC color keys, suitable for Aida fabric
- Use cross-stitch vocabulary naturally: counted cross stitch, Aida, DMC, needlework, embroidery
- Do NOT use these overused openers: "This pattern", "Beautiful", "Stunning", "This design"
- Output only the two paragraphs, no markdown, no headings`;

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  return text;
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\nBackfill SeoDescription  limit=${limit === Infinity ? "all" : limit}  concurrency=${concurrency}  dryRun=${dryRun}`);

  if (!ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY not set in .env");
    process.exit(1);
  }

  const designs = await fetchLatestDesigns(limit === Infinity ? 10000 : limit);
  console.log(`  Found ${designs.length} design(s) to process\n`);

  let ok = 0;
  let skipped = 0;

  async function processOne(design: DesignRow): Promise<void> {
    if (!all && design.hasSeoDescription) {
      console.log(`  [skip] DesignID=${design.designId} — already has SeoDescription`);
      skipped++;
      return;
    }

    const albumCaption = await getAlbumCaption(design.albumId);
    console.log(`  [gen]  DesignID=${design.designId}  "${design.caption}"  album="${albumCaption}"  ${design.width}×${design.height}  ${design.nColors}c`);

    const text = await generateSeoDescription(design, albumCaption);
    console.log(`         DesignID=${design.designId}  ${text.length} chars  "${text.slice(0, 80)}..."`);

    if (!dryRun) {
      await writeSeoDescription(design, text);
      console.log(`         DesignID=${design.designId}  ✓ written`);
    } else {
      console.log(`         DesignID=${design.designId}  (dry-run)`);
    }
    ok++;
  }

  // Process in chunks of `concurrency` in parallel
  for (let i = 0; i < designs.length; i += concurrency) {
    const chunk = designs.slice(i, i + concurrency);
    await Promise.all(chunk.map(processOne));
    console.log(`  --- ${Math.min(i + concurrency, designs.length)}/${designs.length} done ---\n`);
  }

  console.log(`\nDone. processed=${ok}  skipped=${skipped}`);
})();
