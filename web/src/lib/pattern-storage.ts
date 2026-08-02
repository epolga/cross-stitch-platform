import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  QueryCommand,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTimeToLiveCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';
import type { PatternPalette } from './pattern-converter';
import { rleEncode, rleDecode } from './rle';

export { rleEncode, rleDecode };

const TABLE  = process.env.DDB_PATTERNS_TABLE || 'ConverterPatterns';
const REGION = process.env.AWS_REGION || 'us-east-1';

const client = new DynamoDBClient({ region: REGION });

// ── DDB table bootstrap (once per process) ───────────────────────────────────

let _tableReady: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!_tableReady) {
    _tableReady = (async () => {
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
    })().catch((e) => {
      _tableReady = null;
      throw e;
    });
  }
  return _tableReady;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SavedPattern {
  id: string;
  name: string;
  width: number;
  height: number;
  palette: PatternPalette[];
  grid: number[][];
  hiddenColors?: number[];
  createdAt: string;
  modifiedAt: string;
  ownerID?: string;
  progress?: string;
  cellSize?: number;
}

export async function savePattern(
  name: string,
  width: number,
  height: number,
  palette: PatternPalette[],
  grid: number[][],
  ownerID: string,
  thumbnail?: string,
  hiddenColors?: number[],
): Promise<string> {
  await ensureTable();
  const id = randomUUID();
  const rle = rleEncode(grid);
  if (rle.length > 350_000)
    throw new Error('Pattern too large to save (grid exceeds 350 KB compressed)');

  const now = new Date().toISOString();
  const item: Record<string, AttributeValue> = {
    patternId:  { S: id },
    name:       { S: name.trim() || 'Untitled' },
    width:      { N: String(width) },
    height:     { N: String(height) },
    palette:    { S: JSON.stringify(palette) },
    grid:       { S: rle },
    createdAt:  { S: now },
    modifiedAt: { S: now },
    ownerID:    { S: ownerID },
  };
  if (thumbnail) item.thumbnail = { S: thumbnail };
  if (hiddenColors && hiddenColors.length > 0) item.hiddenColors = { S: JSON.stringify(hiddenColors) };

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
  hiddenColors?: number[],
): Promise<void> {
  await ensureTable();
  const rle = rleEncode(grid);
  if (rle.length > 350_000)
    throw new Error('Pattern too large to save (grid exceeds 350 KB compressed)');

  // Partial update (not a full Put) so createdAt is never touched — only
  // modifiedAt should move on a resave.
  const names: Record<string, string> = { '#n': 'name' };
  const values: Record<string, AttributeValue> = {
    ':n': { S: name.trim() || 'Untitled' },
    ':w': { N: String(width) },
    ':h': { N: String(height) },
    ':p': { S: JSON.stringify(palette) },
    ':g': { S: rle },
    ':o': { S: ownerID },
    ':m': { S: new Date().toISOString() },
  };
  const setParts = ['#n = :n', 'width = :w', 'height = :h', 'palette = :p', 'grid = :g', 'ownerID = :o', 'modifiedAt = :m'];
  const removeParts: string[] = [];

  if (thumbnail) { values[':t'] = { S: thumbnail }; setParts.push('thumbnail = :t'); }
  else removeParts.push('thumbnail');

  if (hiddenColors && hiddenColors.length > 0) { values[':hc'] = { S: JSON.stringify(hiddenColors) }; setParts.push('hiddenColors = :hc'); }
  else removeParts.push('hiddenColors');

  let updateExpression = `SET ${setParts.join(', ')}`;
  if (removeParts.length > 0) updateExpression += ` REMOVE ${removeParts.join(', ')}`;

  await client.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { patternId: { S: id } },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

// Lightweight partial update for stitch-progress marks — unlike
// updatePattern(), never touches grid/palette/thumbnail, so marking a
// cell doesn't re-serialize the whole pattern.
export async function saveProgress(id: string, progressRle: string): Promise<void> {
  await ensureTable();
  if (progressRle.length > 350_000)
    throw new Error('Progress too large to save (exceeds 350 KB compressed)');

  await client.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { patternId: { S: id } },
    UpdateExpression: 'SET progress = :p, progressUpdatedAt = :t',
    ExpressionAttributeValues: {
      ':p': { S: progressRle },
      ':t': { S: new Date().toISOString() },
    },
  }));
}

// Lightweight partial update for the owner's zoom preference on this
// pattern — same rationale as saveProgress, kept out of updatePattern.
export async function saveCellSize(id: string, cellSize: number): Promise<void> {
  await ensureTable();
  await client.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { patternId: { S: id } },
    UpdateExpression: 'SET cellSize = :c',
    ExpressionAttributeValues: {
      ':c': { N: String(cellSize) },
    },
  }));
}

export interface PatternSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  createdAt: string;
  modifiedAt: string;
  thumbnail?: string;
}

export async function listPatternsByOwner(ownerID: string): Promise<PatternSummary[]> {
  await ensureTable();
  const { Items = [] } = await client.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'ownerID-index',
    KeyConditionExpression: 'ownerID = :oid',
    ExpressionAttributeValues: { ':oid': { S: ownerID } },
    ProjectionExpression: 'patternId, #n, width, height, createdAt, modifiedAt, thumbnail',
    ExpressionAttributeNames: { '#n': 'name' },
  }));
  return Items.map(item => {
    const createdAt = item.createdAt?.S ?? '';
    return {
      id:         item.patternId.S!,
      name:       item.name?.S ?? 'Untitled',
      width:      parseInt(item.width?.N ?? '0'),
      height:     parseInt(item.height?.N ?? '0'),
      createdAt,
      // Pre-migration rows have no modifiedAt — fall back to createdAt so
      // "most recently touched" sort still works for them.
      modifiedAt: item.modifiedAt?.S ?? createdAt,
      thumbnail:  item.thumbnail?.S,
    };
  }).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
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
  const createdAt = Item.createdAt.S!;

  return {
    id,
    name:         Item.name.S!,
    width,
    height,
    palette:      JSON.parse(Item.palette.S!) as PatternPalette[],
    grid:         rleDecode(Item.grid.S!, width, height),
    hiddenColors: Item.hiddenColors?.S ? JSON.parse(Item.hiddenColors.S) as number[] : undefined,
    createdAt,
    modifiedAt:   Item.modifiedAt?.S ?? createdAt,
    ownerID:      Item.ownerID?.S,
    progress:     Item.progress?.S,
    cellSize:     Item.cellSize?.N ? parseInt(Item.cellSize.N, 10) : undefined,
  };
}
