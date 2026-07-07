import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const S3_BUCKET = "cross-stitch-sitemap-cache";
const VECTORS_KEY = "embeddings/vectors.json";

import { devLog } from "@/lib/devLog";

const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });

type VectorsFile = Record<string, { imageVec: number[]; textVec: number[] }>;

interface VectorIndex {
  img: Map<number, Float32Array>;
  txt: Map<number, Float32Array>;
}

// Use globalThis so the cache survives Next.js HMR module re-requires in dev mode
const g = globalThis as typeof globalThis & {
  __vectorIndex?: VectorIndex;
  __vectorLoadPromise?: Promise<VectorIndex>;
};

async function loadVectorIndex(): Promise<VectorIndex> {
  if (g.__vectorIndex) return g.__vectorIndex;
  if (g.__vectorLoadPromise) return g.__vectorLoadPromise;
  g.__vectorLoadPromise = (async () => {
    const resp = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: VECTORS_KEY }));
    const text = await resp.Body!.transformToString();
    const all = JSON.parse(text) as VectorsFile;
    const img = new Map<number, Float32Array>();
    const txt = new Map<number, Float32Array>();
    for (const [id, vecs] of Object.entries(all)) {
      img.set(Number(id), new Float32Array(vecs.imageVec));
      txt.set(Number(id), new Float32Array(vecs.textVec));
    }
    g.__vectorIndex = { img, txt };
    devLog(`[semantic-search] Loaded vectors for ${img.size} designs`);
    return g.__vectorIndex;
  })().finally(() => { g.__vectorLoadPromise = undefined; });
  return g.__vectorLoadPromise;
}

async function embedText(text: string): Promise<Float32Array> {
  const body = JSON.stringify({ inputText: text.slice(0, 8192) });
  const resp = await bedrock.send(new InvokeModelCommand({
    modelId: "amazon.titan-embed-image-v1",
    contentType: "application/json",
    accept: "application/json",
    body: Buffer.from(body),
  }));
  const result = JSON.parse(Buffer.from(resp.body).toString()) as { embedding: number[] };
  return new Float32Array(result.embedding);
}

async function embedImage(base64Image: string): Promise<Float32Array> {
  const body = JSON.stringify({ inputImage: base64Image });
  const resp = await bedrock.send(new InvokeModelCommand({
    modelId: "amazon.titan-embed-image-v1",
    contentType: "application/json",
    accept: "application/json",
    body: Buffer.from(body),
  }));
  const result = JSON.parse(Buffer.from(resp.body).toString()) as { embedding: number[] };
  return new Float32Array(result.embedding);
}

function dotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function rankByVector(queryVec: Float32Array, index: Map<number, Float32Array>, count: number): number[] {
  const scores: [number, number][] = [];
  for (const [id, vec] of index) {
    scores.push([id, dotProduct(queryVec, vec)]);
  }
  scores.sort((a, b) => b[1] - a[1]);
  return scores.slice(0, count).map(([id]) => id);
}

export async function semanticSearch(query: string, count = 60): Promise<number[]> {
  const [index, queryVec] = await Promise.all([loadVectorIndex(), embedText(query)]);
  return rankByVector(queryVec, index.txt, count);
}

export async function imageSearch(base64Image: string, count = 60): Promise<number[]> {
  const [index, queryVec] = await Promise.all([loadVectorIndex(), embedImage(base64Image)]);
  return rankByVector(queryVec, index.img, count);
}
