import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTimeToLiveCommand,
} from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';
import type { PatternPalette } from './pattern-converter';

const TABLE  = process.env.DDB_PATTERNS_TABLE || 'ConverterPatterns';
const REGION = process.env.AWS_REGION || 'us-east-1';

const client = new DynamoDBClient({ region: REGION });

// ── RLE codec ────────────────────────────────────────────────────────────────

export function rleEncode(grid: number[][]): string {
  const flat = grid.flat();
  if (flat.length === 0) return '';
  const parts: string[] = [];
  let cur = flat[0], count = 1;
  for (let i = 1; i < flat.length; i++) {
    if (flat[i] === cur) { count++; }
    else { parts.push(`${count}:${cur}`); cur = flat[i]; count = 1; }
  }
  parts.push(`${count}:${cur}`);
  return parts.join(',');
}

export function rleDecode(rle: string, width: number, height: number): number[][] {
  const flat: number[] = [];
  for (const part of rle.split(',')) {
    const colon = part.indexOf(':');
    const n = parseInt(part.slice(0, colon));
    const v = parseInt(part.slice(colon + 1));
    for (let i = 0; i < n; i++) flat.push(v);
  }
  return Array.from({ length: height }, (_, y) =>
    flat.slice(y * width, (y + 1) * width)
  );
}

// ── DDB table bootstrap (once per process) ───────────────────────────────────

let _tableReady: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  return (_tableReady ??= (async () => {
    try {
      const { Table } = await client.send(new DescribeTableCommand({ TableName: TABLE }));
      // Table exists but may still be creating — wait for ACTIVE
      if (Table?.TableStatus !== 'ACTIVE') {
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const { Table: t } = await client.send(new DescribeTableCommand({ TableName: TABLE }));
          if (t?.TableStatus === 'ACTIVE') break;
        }
      }
    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== 'ResourceNotFoundException') throw e;
      await client.send(new CreateTableCommand({
        TableName: TABLE,
        KeySchema: [{ AttributeName: 'patternId', KeyType: 'HASH' }],
        AttributeDefinitions: [
          { AttributeName: 'patternId', AttributeType: 'S' },
          { AttributeName: 'ownerID',   AttributeType: 'S' },
        ],
        GlobalSecondaryIndexes: [{
          IndexName: 'ownerID-index',
          KeySchema: [{ AttributeName: 'ownerID', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        }],
        BillingMode: 'PAY_PER_REQUEST',
      }));
      // Poll until ACTIVE before enabling TTL
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const { Table } = await client.send(new DescribeTableCommand({ TableName: TABLE }));
        if (Table?.TableStatus === 'ACTIVE') break;
      }
      await client.send(new UpdateTimeToLiveCommand({
        TableName: TABLE,
        TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
      }));
    }
  })());
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SavedPattern {
  id: string;
  name: string;
  width: number;
  height: number;
  palette: PatternPalette[];
  grid: number[][];
  createdAt: string;
  ownerID?: string;
}

export async function savePattern(
  name: string,
  width: number,
  height: number,
  palette: PatternPalette[],
  grid: number[][],
  ownerID: string,
  thumbnail?: string,
): Promise<string> {
  await ensureTable();
  const id = randomUUID();
  const rle = rleEncode(grid);
  if (rle.length > 350_000)
    throw new Error('Pattern too large to save (grid exceeds 350 KB compressed)');

  const item: Record<string, { S?: string; N?: string }> = {
    patternId: { S: id },
    name:      { S: name.trim() || 'Untitled' },
    width:     { N: String(width) },
    height:    { N: String(height) },
    palette:   { S: JSON.stringify(palette) },
    grid:      { S: rle },
    createdAt: { S: new Date().toISOString() },
    ownerID:   { S: ownerID },
  };
  if (thumbnail) item.thumbnail = { S: thumbnail };

  await client.send(new PutItemCommand({ TableName: TABLE, Item: item }));
  return id;
}

export async function updatePattern(
  id: string,
  name: string,
  width: number,
  height: number,
  palette: PatternPalette[],
  grid: number[][],
  ownerID: string,
  thumbnail?: string,
): Promise<void> {
  await ensureTable();
  const rle = rleEncode(grid);
  if (rle.length > 350_000)
    throw new Error('Pattern too large to save (grid exceeds 350 KB compressed)');

  const item: Record<string, { S?: string; N?: string }> = {
    patternId: { S: id },
    name:      { S: name.trim() || 'Untitled' },
    width:     { N: String(width) },
    height:    { N: String(height) },
    palette:   { S: JSON.stringify(palette) },
    grid:      { S: rle },
    createdAt: { S: new Date().toISOString() },
    ownerID:   { S: ownerID },
  };
  if (thumbnail) item.thumbnail = { S: thumbnail };

  await client.send(new PutItemCommand({ TableName: TABLE, Item: item }));
}

export interface PatternSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  createdAt: string;
  thumbnail?: string;
}

export async function listPatternsByOwner(ownerID: string): Promise<PatternSummary[]> {
  await ensureTable();
  const { Items = [] } = await client.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'ownerID-index',
    KeyConditionExpression: 'ownerID = :oid',
    ExpressionAttributeValues: { ':oid': { S: ownerID } },
    ProjectionExpression: 'patternId, #n, width, height, createdAt, thumbnail',
    ExpressionAttributeNames: { '#n': 'name' },
  }));
  return Items.map(item => ({
    id:        item.patternId.S!,
    name:      item.name?.S ?? 'Untitled',
    width:     parseInt(item.width?.N ?? '0'),
    height:    parseInt(item.height?.N ?? '0'),
    createdAt: item.createdAt?.S ?? '',
    thumbnail: item.thumbnail?.S,
  })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadPattern(id: string): Promise<SavedPattern | null> {
  await ensureTable();
  const { Item } = await client.send(new GetItemCommand({
    TableName: TABLE,
    Key: { patternId: { S: id } },
  }));
  if (!Item) return null;

  const width  = parseInt(Item.width.N!);
  const height = parseInt(Item.height.N!);

  return {
    id,
    name:      Item.name.S!,
    width,
    height,
    palette:   JSON.parse(Item.palette.S!) as PatternPalette[],
    grid:      rleDecode(Item.grid.S!, width, height),
    createdAt: Item.createdAt.S!,
    ownerID:   Item.ownerID?.S,
  };
}
