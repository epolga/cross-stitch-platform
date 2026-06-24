import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const S3_BUCKET = "cross-stitch-sitemap-cache";
const VECTORS_KEY = "embeddings/vectors.json";

const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });

type VectorsFile = Record<string, { img: number[]; txt: number[] }>;

let txtIndex: Map<number, Float32Array> | null = null;
let txtLoadPromise: Promise<Map<number, Float32Array>> | null = null;

async function loadTxtIndex(): Promise<Map<number, Float32Array>> {
  if (txtIndex) return txtIndex;
  if (txtLoadPromise) return txtLoadPromise;
  txtLoadPromise = (async () => {
    const resp = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: VECTORS_KEY }));
    const text = await resp.Body!.transformToString();
    const all = JSON.parse(text) as VectorsFile;
    const map = new Map<number, Float32Array>();
    for (const [id, vecs] of Object.entries(all)) {
      map.set(Number(id), new Float32Array(vecs.txt));
    }
    txtIndex = map;
    console.info(`[semantic-search] Loaded text vectors for ${map.size} designs`);
    return map;
  })().finally(() => { txtLoadPromise = null; });
  return txtLoadPromise;
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

function dotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export async function semanticSearch(query: string, count = 60): Promise<number[]> {
  const [index, queryVec] = await Promise.all([loadTxtIndex(), embedText(query)]);

  const scores: [number, number][] = [];
  for (const [id, txtVec] of index) {
    scores.push([id, dotProduct(queryVec, txtVec)]);
  }

  scores.sort((a, b) => b[1] - a[1]);
  return scores.slice(0, count).map(([id]) => id);
}
