/**
 * Generate image and text embeddings for all ~5,500 cross-stitch designs.
 * Uses Amazon Bedrock Titan Multimodal Embeddings v1 (amazon.titan-embed-image-v1).
 *
 * Image and text embeddings are generated SEPARATELY and stored independently
 * so that compute-similar-designs.ts can weight them: image * 0.75 + text * 0.25.
 *
 * Outputs:
 *   - Local: embeddings-progress.json (checkpoint — resumable if interrupted)
 *   - S3: embeddings/vectors.json in cross-stitch-sitemap-cache bucket
 *
 * Usage:
 *   npx tsx scripts/generate-embeddings.ts              # full batch (~2-3h, ~$0.35)
 *   npx tsx scripts/generate-embeddings.ts --dry-run    # first 5 designs only
 *   npx tsx scripts/generate-embeddings.ts --resume     # skip already-done designs (default)
 *
 * Cost: ~$0.00006/image + ~$0.00002/1K text tokens = ~$0.35 total for 5,500 designs
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import https from "https";

dotenv.config({ path: path.join(process.cwd(), ".env") });

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const ITEMS_TABLE = process.env.ITEMS_TABLE_NAME ?? "CrossStitchItems";
const S3_BUCKET = "cross-stitch-sitemap-cache";
const CLOUDFRONT_BASE = "https://d2o1uvvg91z7o4.cloudfront.net";
const PROGRESS_FILE = path.join(process.cwd(), "embeddings-progress.json");
const CONCURRENCY = 8;
const CHECKPOINT_EVERY = 50; // save progress to disk every N designs

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const bedrock = new BedrockRuntimeClient({ region: REGION });
const s3 = new S3Client({ region: REGION });

interface Design {
  designId: number;
  albumId: number;
  caption: string;
  seoDescription?: string;
}

interface EmbeddingVector {
  imageVec: number[];
  textVec: number[];
}

interface Progress {
  vectors: Record<string, EmbeddingVector>;
  errors: number[];
  startedAt?: string;
}

function loadProgress(): Progress {
  if (fs.existsSync(PROGRESS_FILE)) {
    console.log(`Resuming from ${PROGRESS_FILE}`);
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
  }
  return { vectors: {}, errors: [], startedAt: new Date().toISOString() };
}

function saveProgress(progress: Progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress), "utf-8");
}

async function fetchAllDesigns(): Promise<Design[]> {
  const designs: Design[] = [];
  let lastKey: Record<string, unknown> | undefined;
  process.stdout.write("Loading designs from DDB");
  do {
    const resp = await ddb.send(new ScanCommand({
      TableName: ITEMS_TABLE,
      FilterExpression: "EntityType = :t",
      ExpressionAttributeValues: { ":t": "DESIGN" },
      ProjectionExpression: "DesignID, AlbumID, Caption, SeoDescription",
      ExclusiveStartKey: lastKey,
    }));
    for (const item of resp.Items ?? []) {
      if (item.DesignID && item.AlbumID) {
        designs.push({
          designId: Number(item.DesignID),
          albumId: Number(item.AlbumID),
          caption: String(item.Caption ?? ""),
          seoDescription: item.SeoDescription ? String(item.SeoDescription) : undefined,
        });
      }
    }
    lastKey = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
    process.stdout.write(".");
  } while (lastKey);
  console.log(` ${designs.length} designs loaded`);
  return designs;
}

function fetchImageBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Image fetch timeout")); });
  });
}

async function embedWithRetry(payload: Record<string, unknown>, maxRetries = 4): Promise<number[]> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await bedrock.send(new InvokeModelCommand({
        modelId: "amazon.titan-embed-image-v1",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({ ...payload, embeddingConfig: { outputEmbeddingLength: 1024 } }),
      }));
      const result = JSON.parse(new TextDecoder().decode(resp.body));
      return result.embedding as number[];
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : "";
      const isThrottle = name === "ThrottlingException" || name === "ServiceQuotaExceededException";
      if (isThrottle && attempt < maxRetries) {
        const delay = Math.pow(2, attempt + 1) * 1000 + Math.random() * 500;
        process.stdout.write(`[throttle-wait-${Math.round(delay / 1000)}s]`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error("Max retries exceeded");
}

async function processDesign(design: Design): Promise<EmbeddingVector | null> {
  const imageUrl = `${CLOUDFRONT_BASE}/photos/${design.albumId}/${design.designId}/4.jpg`;
  const text = [design.caption, design.seoDescription].filter(Boolean).join(". ").trim();

  try {
    const base64Image = await fetchImageBase64(imageUrl);
    const [imageVec, textVec] = await Promise.all([
      embedWithRetry({ inputImage: base64Image }),
      embedWithRetry({ inputText: text || design.caption }),
    ]);
    return { imageVec, textVec };
  } catch (err) {
    console.warn(`\n  [skip] design ${design.designId}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (5 designs)" : "FULL BATCH"} | Region: ${REGION} | Table: ${ITEMS_TABLE}`);

  let designs = await fetchAllDesigns();
  if (DRY_RUN) designs = designs.slice(0, 5);

  const progress = loadProgress();
  const remaining = designs.filter(d => !progress.vectors[String(d.designId)] && !progress.errors.includes(d.designId));

  console.log(`Total: ${designs.length} | Done: ${Object.keys(progress.vectors).length} | Errors: ${progress.errors.length} | Remaining: ${remaining.length}`);
  if (remaining.length === 0) {
    console.log("Nothing to do — all designs already processed.");
  }

  const startTime = Date.now();
  let processedThisRun = 0;

  for (let i = 0; i < remaining.length; i += CONCURRENCY) {
    const batch = remaining.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(d => processDesign(d)));

    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      if (result) {
        progress.vectors[String(batch[j].designId)] = result;
        processedThisRun++;
      } else {
        if (!progress.errors.includes(batch[j].designId)) {
          progress.errors.push(batch[j].designId);
        }
      }
    }

    const done = Object.keys(progress.vectors).length;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processedThisRun / elapsed; // per second
    const eta = rate > 0 ? Math.round((remaining.length - processedThisRun) / rate / 60) : "?";

    if (i % (CONCURRENCY * CHECKPOINT_EVERY / CONCURRENCY) === 0 || i + CONCURRENCY >= remaining.length) {
      process.stdout.write(`\r  ${done}/${designs.length} vectors (${Math.round(done / designs.length * 100)}%) | ${Math.round(rate * 60)}/min | ETA ~${eta}min | errors: ${progress.errors.length}   `);
      saveProgress(progress);
    }
  }

  console.log(`\n\nDone. Vectors: ${Object.keys(progress.vectors).length} | Errors: ${progress.errors.length}`);
  if (progress.errors.length > 0) {
    console.log("Errored design IDs (first 20):", progress.errors.slice(0, 20));
  }

  saveProgress(progress);

  if (!DRY_RUN || Object.keys(progress.vectors).length > 0) {
    console.log("Uploading to S3...");
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: "embeddings/vectors.json",
      Body: JSON.stringify(progress.vectors),
      ContentType: "application/json",
    }));
    console.log(`Uploaded to s3://${S3_BUCKET}/embeddings/vectors.json`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
