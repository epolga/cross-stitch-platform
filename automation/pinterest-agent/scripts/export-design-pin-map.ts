import "dotenv/config";
import {
  DynamoDBClient,
  ScanCommand,
  type AttributeValue,
  type ScanCommandInput,
} from "@aws-sdk/client-dynamodb";
import { batchPutDesignPinMap } from "../src/services/historyStore";

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "CrossStitchItems";
const REGION = process.env.AWS_REGION || "us-east-1";

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error("Missing AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in .env");
  process.exit(1);
}

const client = new DynamoDBClient({ region: REGION });

interface DesignPinRecord {
  designId: number;
  albumId: number;
  albumCaption: string;
  pinId: string;
  designCaption: string;
  designUrl: string;
}

function readString(v?: AttributeValue): string | null {
  if (!v || typeof v.S !== "string") return null;
  const trimmed = v.S.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(v?: AttributeValue): number | null {
  if (!v || typeof v.N !== "string") return null;
  const n = parseInt(v.N, 10);
  return Number.isFinite(n) ? n : null;
}

// Pin IDs are stored under several historical attribute names — see src/lib/data-access.ts
function getPinId(item: Record<string, AttributeValue>): string | null {
  return (
    readString(item.PinterestPinId) ||
    readString(item.PinterestPinID) ||
    readString(item.PinterestID) ||
    readString(item.PinterestId) ||
    readString(item.PinID) ||
    readString(item.PinId)
  );
}

// Mirrors CreateDesignUrl in src/lib/url-helper.ts
function buildDesignUrl(caption: string, albumId: number, nPage: number): string {
  const slug = caption.replace(/\s+/g, "-");
  return `/${slug}-${albumId}-${nPage - 1}-Free-Design.aspx`;
}

async function scanAll(): Promise<Record<string, AttributeValue>[]> {
  const items: Record<string, AttributeValue>[] = [];
  let lastKey: Record<string, AttributeValue> | undefined;
  let pages = 0;
  do {
    const params: ScanCommandInput = { TableName: TABLE_NAME };
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const res = await client.send(new ScanCommand(params));
    if (res.Items) items.push(...res.Items);
    lastKey = res.LastEvaluatedKey;
    pages++;
    process.stdout.write(`  scanned ${items.length} items across ${pages} pages\r`);
  } while (lastKey);
  process.stdout.write("\n");
  return items;
}

async function main() {
  console.log(`Scanning ${TABLE_NAME} in ${REGION} ...`);
  const items = await scanAll();

  const albumCaptions = new Map<number, string>();
  const designs: Record<string, AttributeValue>[] = [];

  for (const item of items) {
    const entityType = readString(item.EntityType);
    if (entityType === "ALBUM") {
      const albumId = readNumber(item.AlbumID);
      const caption = readString(item.Caption);
      if (albumId !== null && caption) albumCaptions.set(albumId, caption);
    } else if (entityType === "DESIGN") {
      designs.push(item);
    }
  }

  console.log(`  ${designs.length} designs, ${albumCaptions.size} albums`);

  const records: DesignPinRecord[] = [];
  let skippedNoNPage = 0;
  let unknownAlbum = 0;

  for (const item of designs) {
    const pinId = getPinId(item);
    if (!pinId) continue;

    const designId = readNumber(item.DesignID);
    const albumId = readNumber(item.AlbumID);
    const designCaption = readString(item.Caption);
    const rawNPage = readString(item.NPage);
    const nPage = rawNPage ? parseInt(rawNPage, 10) : NaN;

    if (designId === null || albumId === null || !designCaption || !Number.isFinite(nPage)) {
      if (!Number.isFinite(nPage)) skippedNoNPage++;
      continue;
    }

    const albumCaption = albumCaptions.get(albumId);
    if (!albumCaption) unknownAlbum++;

    records.push({
      designId,
      albumId,
      albumCaption: albumCaption || "",
      pinId,
      designCaption,
      designUrl: buildDesignUrl(designCaption, albumId, nPage),
    });
  }

  records.sort((a, b) => a.designId - b.designId);

  console.log(`  ${records.length} designs with pin IDs`);
  if (unknownAlbum > 0) console.log(`  ${unknownAlbum} reference an album not found in the table`);
  if (skippedNoNPage > 0) console.log(`  ${skippedNoNPage} skipped (missing NPage)`);

  try {
    await batchPutDesignPinMap(records);
    console.log(`Saved → DDB CrossStitchBusinessHistory[DESIGN_PIN_MAP × ${records.length}]`);
  } catch (err) {
    console.error(`  DDB write failed:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err?.message || err);
  process.exit(1);
});
