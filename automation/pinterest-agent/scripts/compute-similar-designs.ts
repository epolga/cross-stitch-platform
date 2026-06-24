/**
 * Precompute top-20 similar designs for every design using the stored Titan embeddings.
 *
 * Scoring formula (Option 3 from the S3 plan):
 *   FinalScore(i, j) = cosine(img_i, img_j) × 0.75 + cosine(txt_i, txt_j) × 0.25
 *
 * Implementation trick: build a single combined vector per design,
 *   W = [√0.75 × imgVec (1024-dim), √0.25 × txtVec (1024-dim)]  → 2048-dim
 * Since Titan vectors are unit-normalized, W is also unit-length, so:
 *   dot(W_i, W_j) = 0.75 × dot(img_i, img_j) + 0.25 × dot(txt_i, txt_j)
 * One dot product per pair, no separate image/text scoring needed.
 *
 * Input:  s3://cross-stitch-sitemap-cache/embeddings/vectors.json
 * Output: s3://cross-stitch-sitemap-cache/embeddings/similar-designs.json
 *         { "5341": [1234, 5678, ...20 designIds], ... }
 *
 * Runtime: ~2–3 min for 5,260 designs.
 * Re-run whenever new designs are added (after generate-embeddings.ts).
 *
 * Usage:
 *   npx tsx scripts/compute-similar-designs.ts
 *   npx tsx scripts/compute-similar-designs.ts --top 12   # change number of results
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env") });

import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const S3_BUCKET = "cross-stitch-sitemap-cache";
const VECTORS_KEY = "embeddings/vectors.json";
const SIMILAR_KEY = "embeddings/similar-designs.json";

const args = process.argv.slice(2);
const topArg = args.find(a => a.startsWith("--top=") || a === "--top");
const TOP_N = topArg
  ? parseInt(topArg.startsWith("--top=") ? topArg.slice(6) : args[args.indexOf("--top") + 1], 10)
  : 20;

const IMG_WEIGHT = Math.sqrt(0.75);
const TXT_WEIGHT = Math.sqrt(0.25);

const s3 = new S3Client({ region: REGION });

interface RawVectors {
  [designId: string]: {
    imageVec: number[];
    textVec: number[];
  };
}

async function loadFromS3(key: string): Promise<string> {
  const resp = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  return resp.Body!.transformToString();
}

function l2Normalize(v: Float32Array): Float32Array {
  let sumSq = 0;
  for (let i = 0; i < v.length; i++) sumSq += v[i] * v[i];
  const norm = Math.sqrt(sumSq);
  if (norm < 1e-10) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

// Combined vector: [√0.75 × img (1024), √0.25 × txt (1024)] — unit-length, 2048-dim
function buildCombined(imgVec: number[], txtVec: number[]): Float32Array {
  const dim = imgVec.length; // 1024
  const img = l2Normalize(new Float32Array(imgVec));
  const txt = l2Normalize(new Float32Array(txtVec));
  const combined = new Float32Array(dim * 2);
  for (let i = 0; i < dim; i++) combined[i] = img[i] * IMG_WEIGHT;
  for (let i = 0; i < dim; i++) combined[dim + i] = txt[i] * TXT_WEIGHT;
  return combined; // ||combined||² = 0.75 + 0.25 = 1 ✓
}

// Dot product of two Float32Arrays
function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Find top-K indices by score (excluding self at index `selfIdx`)
function topK(scores: Float32Array, selfIdx: number, k: number): number[] {
  // Min-heap approach: O(N log K) vs O(N log N) for full sort
  type Entry = { idx: number; score: number };
  const heap: Entry[] = [];

  const push = (e: Entry) => {
    heap.push(e);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].score <= heap[i].score) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };

  const pop = (): Entry => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      while (true) {
        let smallest = i;
        const l = 2 * i + 1, r = 2 * i + 2;
        if (l < heap.length && heap[l].score < heap[smallest].score) smallest = l;
        if (r < heap.length && heap[r].score < heap[smallest].score) smallest = r;
        if (smallest === i) break;
        [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
        i = smallest;
      }
    }
    return top;
  };

  for (let j = 0; j < scores.length; j++) {
    if (j === selfIdx) continue;
    if (heap.length < k) {
      push({ idx: j, score: scores[j] });
    } else if (scores[j] > heap[0].score) {
      pop();
      push({ idx: j, score: scores[j] });
    }
  }

  return heap.sort((a, b) => b.score - a.score).map(e => e.idx);
}

async function main() {
  console.log(`Loading vectors from s3://${S3_BUCKET}/${VECTORS_KEY} ...`);
  const raw: RawVectors = JSON.parse(await loadFromS3(VECTORS_KEY));
  const ids = Object.keys(raw);
  const n = ids.length;
  console.log(`Loaded ${n} design vectors`);

  console.log("Building combined weighted vectors (2048-dim)...");
  const combined: Float32Array[] = new Array(n);
  for (let i = 0; i < n; i++) {
    combined[i] = buildCombined(raw[ids[i]].imageVec, raw[ids[i]].textVec);
  }

  // Free raw vectors from memory
  (raw as unknown as null);

  console.log(`Computing top-${TOP_N} for ${n} designs...`);
  const startTime = Date.now();
  const similarMap: Record<string, number[]> = {};

  for (let i = 0; i < n; i++) {
    // Compute scores against all designs
    const scores = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      scores[j] = dot(combined[i], combined[j]);
    }
    const topIdxs = topK(scores, i, TOP_N);
    similarMap[ids[i]] = topIdxs.map(idx => Number(ids[idx]));

    if ((i + 1) % 200 === 0 || i === n - 1) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i + 1) / elapsed;
      const eta = Math.round((n - i - 1) / rate);
      process.stdout.write(`\r  ${i + 1}/${n} (${Math.round((i + 1) / n * 100)}%) | ${Math.round(rate)}/s | ETA ~${eta}s   `);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\nComputed in ${elapsed}s`);

  const payload = JSON.stringify(similarMap);
  const sizeKB = Math.round(Buffer.byteLength(payload) / 1024);
  console.log(`Uploading ${sizeKB}KB to s3://${S3_BUCKET}/${SIMILAR_KEY} ...`);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await s3.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: SIMILAR_KEY,
        Body: payload,
        ContentType: "application/json",
      }));
      break;
    } catch (err) {
      if (attempt === 3) throw err;
      console.log(`  upload attempt ${attempt} failed (${(err as Error).message}), retrying...`);
      await new Promise(r => setTimeout(r, 3000 * attempt));
    }
  }

  console.log("Done.");
  console.log(`  Designs: ${n}`);
  console.log(`  Top-N: ${TOP_N}`);
  console.log(`  Map size: ${sizeKB}KB`);
}

main().catch(err => { console.error(err); process.exit(1); });
