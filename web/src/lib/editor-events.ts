import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  GetItemCommand,
  UpdateItemCommand,
  CreateTableCommand,
  DescribeTableCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { randomUUID } from 'crypto';

const TABLE  = process.env.DDB_EDITOR_EVENTS_TABLE || 'EditorEvents';
const REGION = process.env.AWS_REGION || 'us-east-1';

const client    = new DynamoDBClient({ region: REGION });
const sesClient = new SESClient({ region: REGION });

const MILESTONES_ID = 'MILESTONES';

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
  rating?: string;
  qualityReason?: string;
}

export interface EditorEventRecord extends EditorEvent {
  id: string;
  ts: string;
  date: string;
  ttl: number;
}

interface Milestones {
  firstEditorUsage: boolean;
  firstPdfExport: boolean;
  firstFeedback: boolean;
  errorAlertSentDate: string;
  errorCountToday: number;
  errorCountDate: string;
}

async function getMilestones(): Promise<Milestones> {
  const { Item } = await client.send(new GetItemCommand({
    TableName: TABLE,
    Key: { id: { S: MILESTONES_ID } },
  }));
  return {
    firstEditorUsage:      Item?.firstEditorUsage?.BOOL      ?? false,
    firstPdfExport:        Item?.firstPdfExport?.BOOL        ?? false,
    firstFeedback:         Item?.firstFeedback?.BOOL         ?? false,
    errorAlertSentDate:    Item?.errorAlertSentDate?.S       ?? '',
    errorCountToday:       Item?.errorCountToday?.N ? parseInt(Item.errorCountToday.N) : 0,
    errorCountDate:        Item?.errorCountDate?.S           ?? '',
  };
}

async function updateMilestones(updates: Record<string, AttributeValue>): Promise<void> {
  const expParts: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, AttributeValue> = {};
  let i = 0;
  for (const [k, v] of Object.entries(updates)) {
    expParts.push(`#f${i} = :v${i}`);
    names[`#f${i}`] = k;
    values[`:v${i}`] = v;
    i++;
  }
  await client.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { id: { S: MILESTONES_ID } },
    UpdateExpression: `SET ${expParts.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

async function sendAlertEmail(subject: string, text: string): Promise<void> {
  const sender    = process.env.SES_SENDER    || 'ann@cross-stitch.com';
  const recipient = process.env.SES_RECIPIENT || 'olga.epstein@gmail.com';
  await sesClient.send(new SendEmailCommand({
    Source: sender,
    Destination: { ToAddresses: [recipient] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body:    { Text: { Data: text, Charset: 'UTF-8' } },
    },
  }));
}

async function checkAndNotify(event: EditorEvent): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const m = await getMilestones();

  if (event.eventType === 'editor_opened' && !m.firstEditorUsage) {
    await sendAlertEmail(
      '[cross-stitch] First editor visitor!',
      `Someone opened the cross-stitch editor for the first time.\n\nsource: ${event.source ?? 'direct'}\nsessionId: ${event.sessionId}\ntime: ${new Date().toISOString()}`,
    );
    await updateMilestones({ firstEditorUsage: { BOOL: true } });
    return;
  }

  if (event.eventType === 'pdf_exported' && !m.firstPdfExport) {
    await sendAlertEmail(
      '[cross-stitch] First PDF exported from the editor!',
      `Someone exported a PDF from the editor for the first time.\n\nsessionId: ${event.sessionId}\nwidth: ${event.patternWidth ?? '?'}  height: ${event.patternHeight ?? '?'}  colors: ${event.colorCount ?? '?'}\ntime: ${new Date().toISOString()}`,
    );
    await updateMilestones({ firstPdfExport: { BOOL: true } });
    return;
  }

  if (event.eventType === 'feedback_submitted' && !m.firstFeedback) {
    await sendAlertEmail(
      '[cross-stitch] First editor feedback submitted!',
      `Someone submitted feedback from the editor for the first time.\n\nsessionId: ${event.sessionId}\nimportance: ${event.importance ?? '?'}\ntime: ${new Date().toISOString()}`,
    );
    await updateMilestones({ firstFeedback: { BOOL: true } });
    return;
  }

  if (event.eventType === 'pattern_generated_return_visit') {
    await sendAlertEmail(
      '[cross-stitch] Return-visit pattern generation',
      `Someone came back in a new session and generated another pattern — a retention signal.\n\nsessionId: ${event.sessionId}\ntime: ${new Date().toISOString()}`,
    );
    return;
  }

  if (event.eventType === 'editor_error') {
    const isNewDay  = m.errorCountDate !== today;
    const newCount  = isNewDay ? 1 : m.errorCountToday + 1;
    await updateMilestones({
      errorCountToday: { N: String(newCount) },
      errorCountDate:  { S: today },
    });
    if (newCount > 5 && m.errorAlertSentDate !== today) {
      await sendAlertEmail(
        `[cross-stitch] Editor error alert — ${newCount} errors today`,
        `The editor has logged ${newCount} errors on ${today}.\n\nLast error: step=${event.step ?? '?'}, code=${event.errorCode ?? '?'}\nsessionId: ${event.sessionId}\n\nCheck the EditorEvents DDB table for details.`,
      );
      await updateMilestones({ errorAlertSentDate: { S: today } });
    }
  }
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
  if (event.rating)              item.rating       = { S: event.rating };
  if (event.qualityReason)       item.qualityReason = { S: event.qualityReason };

  await client.send(new PutItemCommand({ TableName: TABLE, Item: item }));

  checkAndNotify(event).catch(err => console.error('[editor-events] notify error', err));
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
    rating:        item.rating?.S,
    qualityReason: item.qualityReason?.S,
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

export async function getRecentEventsByType(eventType: string, limit: number): Promise<EditorEventRecord[]> {
  await ensureTable();
  const results: EditorEventRecord[] = [];
  let lastKey: Record<string, AttributeValue> | undefined;
  do {
    const { Items = [], LastEvaluatedKey } = await client.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'eventType = :et',
      ExpressionAttributeValues: { ':et': { S: eventType } },
      ExclusiveStartKey: lastKey,
    }));
    results.push(...Items.map(i => itemToRecord(i as Record<string, AttributeValue>)));
    lastKey = LastEvaluatedKey as Record<string, AttributeValue> | undefined;
  } while (lastKey);
  results.sort((a, b) => b.ts.localeCompare(a.ts));
  return results.slice(0, limit);
}
