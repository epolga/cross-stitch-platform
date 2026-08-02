import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  UpdateItemCommand,
  CreateTableCommand,
  DescribeTableCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';

const TABLE  = process.env.DDB_FEATURE_REQUESTS_TABLE || 'FeatureRequests';
const REGION = process.env.AWS_REGION || 'us-east-1';

const client = new DynamoDBClient({ region: REGION });

let _tableReady: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!_tableReady) {
    _tableReady = (async () => {
      try {
        const { Table } = await client.send(new DescribeTableCommand({ TableName: TABLE }));
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
          KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
          AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
          BillingMode: 'PAY_PER_REQUEST',
        }));
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const { Table } = await client.send(new DescribeTableCommand({ TableName: TABLE }));
          if (Table?.TableStatus === 'ACTIVE') break;
        }
      }
    })().catch((e) => {
      _tableReady = null;
      throw e;
    });
  }
  return _tableReady;
}

export type Importance = 'nice-to-have' | 'important' | 'need-this';
export type RequestStatus = 'new' | 'reviewed' | 'planned' | 'done' | 'rejected';

export interface FeatureRequest {
  id: string;
  createdAt: string;
  text: string;
  importance: Importance;
  status: RequestStatus;
  email?: string;
  pageUrl?: string;
  patternWidth?: number;
  patternHeight?: number;
  colorsCount?: number;
  editorTimeSeconds?: number;
  userChangedStitchesCount?: number;
  exportedPdf?: boolean;
  userId?: string;
  browserLanguage?: string;
  userAgent?: string;
}

export interface SaveFeatureRequestInput {
  text: string;
  importance: Importance;
  email?: string;
  pageUrl?: string;
  patternWidth?: number;
  patternHeight?: number;
  colorsCount?: number;
  editorTimeSeconds?: number;
  userChangedStitchesCount?: number;
  exportedPdf?: boolean;
  userId?: string;
  browserLanguage?: string;
  userAgent?: string;
}

export async function saveFeatureRequest(input: SaveFeatureRequestInput): Promise<string> {
  await ensureTable();
  const id = randomUUID();
  const item: Record<string, AttributeValue> = {
    id:        { S: id },
    createdAt: { S: new Date().toISOString() },
    text:      { S: input.text },
    importance:{ S: input.importance },
    status:    { S: 'new' },
  };
  if (input.email)                        item.email              = { S: input.email };
  if (input.pageUrl)                      item.pageUrl            = { S: input.pageUrl };
  if (input.patternWidth != null)         item.patternWidth       = { N: String(input.patternWidth) };
  if (input.patternHeight != null)        item.patternHeight      = { N: String(input.patternHeight) };
  if (input.colorsCount != null)          item.colorsCount        = { N: String(input.colorsCount) };
  if (input.editorTimeSeconds != null)    item.editorTimeSeconds  = { N: String(input.editorTimeSeconds) };
  if (input.userChangedStitchesCount != null) item.userChangedStitchesCount = { N: String(input.userChangedStitchesCount) };
  if (input.exportedPdf != null)          item.exportedPdf        = { BOOL: input.exportedPdf };
  if (input.userId)                       item.userId             = { S: input.userId };
  if (input.browserLanguage)             item.browserLanguage    = { S: input.browserLanguage };
  if (input.userAgent)                   item.userAgent          = { S: input.userAgent };

  await client.send(new PutItemCommand({ TableName: TABLE, Item: item }));
  return id;
}

function itemToRequest(item: Record<string, AttributeValue>): FeatureRequest {
  return {
    id:                       item.id.S!,
    createdAt:                item.createdAt.S!,
    text:                     item.text.S!,
    importance:               item.importance.S as Importance,
    status:                   (item.status?.S ?? 'new') as RequestStatus,
    email:                    item.email?.S,
    pageUrl:                  item.pageUrl?.S,
    patternWidth:             item.patternWidth  ? parseInt(item.patternWidth.N!)  : undefined,
    patternHeight:            item.patternHeight ? parseInt(item.patternHeight.N!) : undefined,
    colorsCount:              item.colorsCount   ? parseInt(item.colorsCount.N!)   : undefined,
    editorTimeSeconds:        item.editorTimeSeconds ? parseInt(item.editorTimeSeconds.N!) : undefined,
    userChangedStitchesCount: item.userChangedStitchesCount ? parseInt(item.userChangedStitchesCount.N!) : undefined,
    exportedPdf:              item.exportedPdf?.BOOL,
    userId:                   item.userId?.S,
    browserLanguage:          item.browserLanguage?.S,
    userAgent:                item.userAgent?.S,
  };
}

export async function listFeatureRequests(): Promise<FeatureRequest[]> {
  await ensureTable();
  const results: FeatureRequest[] = [];
  let lastKey: Record<string, AttributeValue> | undefined;
  do {
    const { Items = [], LastEvaluatedKey } = await client.send(new ScanCommand({
      TableName: TABLE,
      ExclusiveStartKey: lastKey,
    }));
    results.push(...Items.map(itemToRequest));
    lastKey = LastEvaluatedKey as Record<string, AttributeValue> | undefined;
  } while (lastKey);
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateFeatureRequestStatus(id: string, status: RequestStatus): Promise<void> {
  await ensureTable();
  await client.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { id: { S: id } },
    UpdateExpression: 'SET #s = :s, updatedAt = :u',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':s': { S: status },
      ':u': { S: new Date().toISOString() },
    },
  }));
}

export async function getFeatureRequest(id: string): Promise<FeatureRequest | null> {
  await ensureTable();
  const { Item } = await client.send(new GetItemCommand({
    TableName: TABLE,
    Key: { id: { S: id } },
  }));
  return Item ? itemToRequest(Item as Record<string, AttributeValue>) : null;
}
