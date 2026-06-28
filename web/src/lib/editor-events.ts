import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  CreateTableCommand,
  DescribeTableCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';

const TABLE  = process.env.DDB_EDITOR_EVENTS_TABLE || 'EditorEvents';
const REGION = process.env.AWS_REGION || 'us-east-1';

const client = new DynamoDBClient({ region: REGION });

let _tableReady: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  return (_tableReady ??= (async () => {
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
        AttributeDefinitions: [
          { AttributeName: 'id',        AttributeType: 'S' },
          { AttributeName: 'date',      AttributeType: 'S' },
          { AttributeName: 'eventType', AttributeType: 'S' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
        GlobalSecondaryIndexes: [{
          IndexName: 'date-eventType-index',
          KeySchema: [
            { AttributeName: 'date',      KeyType: 'HASH' },
            { AttributeName: 'eventType', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        }],
      }));
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const { Table } = await client.send(new DescribeTableCommand({ TableName: TABLE }));
        if (Table?.TableStatus === 'ACTIVE') break;
      }
    }
  })());
}

export interface EditorEvent {
  eventType: string;
  sessionId: string;
  userId?: string;
  patternId?: string;
  patternWidth?: number;
  patternHeight?: number;
  colorCount?: number;
  source?: string;
  errorCode?: string;
  step?: string;
  importance?: string;
}

export interface EditorEventRecord extends EditorEvent {
  id: string;
  ts: string;
  date: string;
  ttl: number;
}

export async function logEditorEvent(event: EditorEvent): Promise<void> {
  await ensureTable();
  const now = new Date();
  const ttl = Math.floor(now.getTime() / 1000) + 90 * 24 * 60 * 60;

  const item: Record<string, AttributeValue> = {
    id:        { S: randomUUID() },
    eventType: { S: event.eventType },
    ts:        { S: now.toISOString() },
    date:      { S: now.toISOString().slice(0, 10) },
    sessionId: { S: event.sessionId },
    ttl:       { N: String(ttl) },
  };

  if (event.userId)              item.userId       = { S: event.userId };
  if (event.patternId)           item.patternId    = { S: event.patternId };
  if (event.patternWidth  != null) item.patternWidth  = { N: String(event.patternWidth) };
  if (event.patternHeight != null) item.patternHeight = { N: String(event.patternHeight) };
  if (event.colorCount    != null) item.colorCount    = { N: String(event.colorCount) };
  if (event.source)              item.source       = { S: event.source };
  if (event.errorCode)           item.errorCode    = { S: event.errorCode };
  if (event.step)                item.step         = { S: event.step };
  if (event.importance)          item.importance   = { S: event.importance };

  await client.send(new PutItemCommand({ TableName: TABLE, Item: item }));
}

function itemToRecord(item: Record<string, AttributeValue>): EditorEventRecord {
  return {
    id:            item.id.S!,
    eventType:     item.eventType.S!,
    ts:            item.ts.S!,
    date:          item.date.S!,
    sessionId:     item.sessionId.S!,
    ttl:           parseInt(item.ttl?.N ?? '0'),
    userId:        item.userId?.S,
    patternId:     item.patternId?.S,
    patternWidth:  item.patternWidth  ? parseInt(item.patternWidth.N!)  : undefined,
    patternHeight: item.patternHeight ? parseInt(item.patternHeight.N!) : undefined,
    colorCount:    item.colorCount    ? parseInt(item.colorCount.N!)    : undefined,
    source:        item.source?.S,
    errorCode:     item.errorCode?.S,
    step:          item.step?.S,
    importance:    item.importance?.S,
  };
}

export async function getEditorEventsByDate(date: string): Promise<EditorEventRecord[]> {
  await ensureTable();
  const results: EditorEventRecord[] = [];
  let lastKey: Record<string, AttributeValue> | undefined;
  do {
    const { Items = [], LastEvaluatedKey } = await client.send(new QueryCommand({
      TableName: TABLE,
      IndexName: 'date-eventType-index',
      KeyConditionExpression: '#date = :date',
      ExpressionAttributeNames: { '#date': 'date' },
      ExpressionAttributeValues: { ':date': { S: date } },
      ExclusiveStartKey: lastKey,
    }));
    results.push(...Items.map(i => itemToRecord(i as Record<string, AttributeValue>)));
    lastKey = LastEvaluatedKey as Record<string, AttributeValue> | undefined;
  } while (lastKey);
  return results;
}

export async function getEditorEventCounts(date: string): Promise<Record<string, number>> {
  const events = await getEditorEventsByDate(date);
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.eventType] = (counts[e.eventType] ?? 0) + 1;
  }
  return counts;
}
