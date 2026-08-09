import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { fetchAllDesigns, getAllAlbumCaptions } from "@/lib/data-access";

const S3_BUCKET = "cross-stitch-sitemap-cache";
const VECTORS_KEY = "embeddings/vectors.json";
// 2026-08-09: separate file from VECTORS_KEY, not a namespaced entry in
// the same one — albums (114) and designs (~5276) have very different
// scale/growth patterns, and design IDs vs album IDs live in different
// numeric spaces (a shared JSON object keyed by plain number strings
// could collide). Text-only (no imageVec) since there's no single
// "album photo" the way there's one per design.
const ALBUM_VECTORS_KEY = "embeddings/album-vectors.json";

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

// Use globalThis so the cache survives Next.js HMR module re-requires in dev mode
const ga = globalThis as typeof globalThis & {
  __albumVectorIndex?: Map<number, Float32Array>;
  __albumVectorLoadPromise?: Promise<Map<number, Float32Array>>;
};

async function loadAlbumVectorIndex(): Promise<Map<number, Float32Array>> {
  if (ga.__albumVectorIndex) return ga.__albumVectorIndex;
  if (ga.__albumVectorLoadPromise) return ga.__albumVectorLoadPromise;
  ga.__albumVectorLoadPromise = (async () => {
    try {
      const resp = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: ALBUM_VECTORS_KEY }));
      const text = await resp.Body!.transformToString();
      const all = JSON.parse(text) as Record<string, number[]>;
      const index = new Map<number, Float32Array>();
      for (const [id, vec] of Object.entries(all)) index.set(Number(id), new Float32Array(vec));
      ga.__albumVectorIndex = index;
      devLog(`[semantic-search] Loaded album vectors for ${index.size} albums`);
      return index;
    } catch (e) {
      // First-ever run (file doesn't exist in S3 yet) — treat as empty,
      // backfillMissingAlbumEmbeddings() below will populate it.
      const notFound = (e as { name?: string })?.name === 'NoSuchKey';
      if (!notFound) console.error('[semantic-search] failed to load album vectors:', e);
      const index = new Map<number, Float32Array>();
      ga.__albumVectorIndex = index;
      return index;
    }
  })().finally(() => { ga.__albumVectorLoadPromise = undefined; });
  return ga.__albumVectorLoadPromise;
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

export interface CatalogMatch {
  designId: number;
  similarity: number;
}

// Same brute-force approach as rankByVector, but returns the single
// closest design and its raw score instead of a ranked ID list — for
// duplicate-detection callers (trend-detection.ts's search_catalog tool)
// that need to know HOW similar the nearest match is, not just its rank.
export async function findNearestTextMatch(text: string): Promise<CatalogMatch | null> {
  const [index, queryVec] = await Promise.all([loadVectorIndex(), embedText(text)]);
  let best: CatalogMatch | null = null;
  for (const [designId, vec] of index.txt) {
    const similarity = dotProduct(queryVec, vec);
    if (!best || similarity > best.similarity) best = { designId, similarity };
  }
  return best;
}

export interface AlbumCatalogMatch {
  albumId: number;
  similarity: number;
}

// 2026-08-09: Olga's ask, after checking Album 59 ("Butterflies", 73
// designs) — the design-level check (findNearestTextMatch) already
// catches most near-duplicates since individual design captions
//("Butterfly 1", "Butterfly 2"...) carry the real subject word. But an
// album-level check is a genuinely different signal, not a redundant
// one: it catches the case the OLD album-caption-only avoid-list existed
// for in the first place (a subject that's clearly, thematically
// "already a whole album" — e.g. proposing "butterfly" as a new theme
// when a 73-design dedicated Butterflies album exists), even in cases
// where individual design captions are terse/generic enough that no
// single one scores as high as the album's own caption does. Runs
// alongside, not instead of, the design-level check — see
// runSearchCatalogTool() in trend-detection.ts.
export async function findNearestAlbumMatch(text: string): Promise<AlbumCatalogMatch | null> {
  const [index, queryVec] = await Promise.all([loadAlbumVectorIndex(), embedText(text)]);
  let best: AlbumCatalogMatch | null = null;
  for (const [albumId, vec] of index) {
    const similarity = dotProduct(queryVec, vec);
    if (!best || similarity > best.similarity) best = { albumId, similarity };
  }
  return best;
}

// 2026-08-09: found live — vectors.json had 5260/5276 designs (the
// "Capybara" design published via "Publish to Catalog" among the 16
// missing), because nothing regenerates embeddings when a design is
// added; only the standalone batch script
// (automation/pinterest-agent/scripts/generate-embeddings.ts) does, and
// only when someone remembers to run it. A stale index isn't just a
// staleness nitpick here — it's a silent false negative for
// trend-detection.ts's search_catalog tool (a genuinely duplicate theme
// reads as brand new because the real match's vector simply isn't in the
// index to be found). Olga's ask: always keep this current, not a
// one-off manual fix — so detectTrend() calls this itself before running
// (see trend-detection.ts), instead of relying on someone remembering to
// run the batch script.
//
// Deliberately NOT the same code path as generate-embeddings.ts (that
// one is a from-scratch full-catalog batch tool, DynamoDB Scan + its own
// checkpoint file, meant to be run standalone in
// automation/pinterest-agent). This is the same Titan calls, reusing
// this file's own embedText/embedImage plus data-access.ts's already-
// cached fetchAllDesigns(), so a "nothing missing" call (the common
// case) costs no more than the index load already needed to serve a
// search.
export async function backfillMissingEmbeddings(): Promise<{ added: number; errors: number }> {
  const [index, designs] = await Promise.all([loadVectorIndex(), fetchAllDesigns()]);
  const missing = designs.filter((d) => !index.txt.has(d.DesignID));
  if (missing.length === 0) return { added: 0, errors: 0 };

  let added = 0;
  let errors = 0;
  for (const design of missing) {
    try {
      const imageUrl =
        design.ImageUrl ||
        `https://d2o1uvvg91z7o4.cloudfront.net/photos/${design.AlbumID}/${design.DesignID}/4.jpg`;
      const imgResp = await fetch(imageUrl);
      if (!imgResp.ok) throw new Error(`image fetch HTTP ${imgResp.status}`);
      const base64Image = Buffer.from(await imgResp.arrayBuffer()).toString("base64");
      const [imageVec, textVec] = await Promise.all([
        embedImage(base64Image),
        embedText(design.Caption || `design #${design.DesignID}`),
      ]);
      index.img.set(design.DesignID, imageVec);
      index.txt.set(design.DesignID, textVec);
      added++;
    } catch (e) {
      errors++;
      console.error(`[semantic-search] backfill failed for design ${design.DesignID}:`, e);
    }
  }

  if (added > 0) {
    const merged: VectorsFile = {};
    for (const [id, vec] of index.img) {
      merged[id] = { imageVec: Array.from(vec), textVec: Array.from(index.txt.get(id) ?? []) };
    }
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: VECTORS_KEY,
      Body: JSON.stringify(merged),
      ContentType: "application/json",
    }));
    devLog(`[semantic-search] Backfilled ${added} missing design embeddings (${errors} errors)`);
  }

  return { added, errors };
}

// Same backfill pattern as backfillMissingEmbeddings(), for the album
// index instead — text-only (no image fetch needed), 114 albums total
// so a full first-run backfill is trivially cheap either way.
export async function backfillMissingAlbumEmbeddings(): Promise<{ added: number; errors: number }> {
  const [index, albums] = await Promise.all([loadAlbumVectorIndex(), getAllAlbumCaptions()]);
  const missing = (albums ?? []).filter((a) => !index.has(a.albumId));
  if (missing.length === 0) return { added: 0, errors: 0 };

  let added = 0;
  let errors = 0;
  for (const album of missing) {
    try {
      const vec = await embedText(album.Caption || `album #${album.albumId}`);
      index.set(album.albumId, vec);
      added++;
    } catch (e) {
      errors++;
      console.error(`[semantic-search] album backfill failed for album ${album.albumId}:`, e);
    }
  }

  if (added > 0) {
    const merged: Record<string, number[]> = {};
    for (const [id, vec] of index) merged[id] = Array.from(vec);
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: ALBUM_VECTORS_KEY,
      Body: JSON.stringify(merged),
      ContentType: "application/json",
    }));
    devLog(`[semantic-search] Backfilled ${added} missing album embeddings (${errors} errors)`);
  }

  return { added, errors };
}
