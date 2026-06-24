import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getDesignById } from "@/lib/data-access";
import type { Design } from "@/app/types/design";

const S3_BUCKET = "cross-stitch-sitemap-cache";
const SIMILAR_KEY = "embeddings/similar-designs.json";

const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });

type SimilarMap = Record<string, number[]>;

let mapCache: SimilarMap | null = null;
let mapLoadPromise: Promise<SimilarMap> | null = null;

async function loadSimilarMap(): Promise<SimilarMap> {
  if (mapCache) return mapCache;
  if (mapLoadPromise) return mapLoadPromise;

  mapLoadPromise = (async () => {
    const resp = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: SIMILAR_KEY }));
    const text = await resp.Body!.transformToString();
    mapCache = JSON.parse(text) as SimilarMap;
    console.info(`[similar-designs] Loaded ${Object.keys(mapCache).length} entries from S3`);
    return mapCache;
  })().finally(() => {
    mapLoadPromise = null;
  });

  return mapLoadPromise;
}

export async function getSimilarIds(designId: number): Promise<number[]> {
  const map = await loadSimilarMap();
  return map[String(designId)] ?? [];
}

export async function getSimilarDesigns(designId: number, count = 12): Promise<Design[]> {
  try {
    const map = await loadSimilarMap();
    const ids = map[String(designId)];
    if (!ids || ids.length === 0) {
      console.log(`[similar-designs] No entry for design ${designId} in map (map size: ${Object.keys(map).length})`);
      return [];
    }
    const designs = await Promise.all(ids.slice(0, count).map(id => getDesignById(id)));
    const found = designs.filter((d): d is Design => d !== undefined);
    console.log(`[similar-designs] design ${designId}: ${found.length}/${count} resolved`);
    return found;
  } catch (err) {
    console.log(`[similar-designs] ERROR for design ${designId}: ${err}`);
    return [];
  }
}
