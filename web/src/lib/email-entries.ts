import {
  DynamoDBClient,
  UpdateItemCommand,
  QueryCommand,
  CreateTableCommand,
  DescribeTableCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';

const TABLE = process.env.DDB_EMAIL_ENTRY_EVENTS_TABLE || 'EmailEntryEvents';
const REGION = process.env.AWS_REGION || 'us-east-1';
const client = new DynamoDBClient({ region: REGION });

let tableReady: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  return (tableReady ??= (async () => {
    try {
      await client.send(new DescribeTableCommand({ TableName: TABLE }));
    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== 'ResourceNotFoundException') throw e;
      await client.send(
        new CreateTableCommand({
          TableName: TABLE,
          KeySchema: [
            { AttributeName: 'eid', KeyType: 'HASH' },
            { AttributeName: 'cid', KeyType: 'RANGE' },
          ],
          AttributeDefinitions: [
            { AttributeName: 'eid', AttributeType: 'S' },
            { AttributeName: 'cid', AttributeType: 'S' },
          ],
          BillingMode: 'PAY_PER_REQUEST',
        }),
      );
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const { Table } = await client.send(new DescribeTableCommand({ TableName: TABLE }));
        if (Table?.TableStatus === 'ACTIVE') break;
      }
    }
  })());
}

export interface EmailEntryRecord {
  eid: string;
  cid: string;
  email?: string;
  firstEntryAt: string;
  lastEntryAt: string;
  entryCount: number;
}

export interface EmailCampaignSummary {
  eid: string;
  uniqueEntries: number;
  totalEntries: number;
}

/**
 * Records one entry (click-through) from a newsletter/announcement link for
 * a given campaign (eid) and user (cid). Idempotent per (eid, cid) pair —
 * a repeat click from the same user on the same campaign bumps entryCount
 * instead of creating a new row, so uniqueEntries == item count for that eid.
 */
export async function recordEmailEntryEvent(
  eid: string,
  cid: string,
  email?: string,
): Promise<void> {
  const trimmedEid = eid.trim();
  const trimmedCid = cid.trim();
  if (!trimmedEid || !trimmedCid) return;

  await ensureTable();
  const nowIso = new Date().toISOString();

  const names: Record<string, string> = {
    '#lastEntryAt': 'LastEntryAt',
    '#firstEntryAt': 'FirstEntryAt',
    '#entryCount': 'EntryCount',
  };
  const values: Record<string, AttributeValue> = {
    ':now': { S: nowIso },
    ':one': { N: '1' },
  };
  let setClause = '#lastEntryAt = :now, #firstEntryAt = if_not_exists(#firstEntryAt, :now)';
  if (email) {
    names['#email'] = 'Email';
    values[':email'] = { S: email.trim().toLowerCase() };
    setClause += ', #email = :email';
  }

  await client.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { eid: { S: trimmedEid }, cid: { S: trimmedCid } },
      UpdateExpression: `SET ${setClause} ADD #entryCount :one`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

function itemToRecord(item: Record<string, AttributeValue>): EmailEntryRecord {
  return {
    eid: item.eid.S!,
    cid: item.cid.S!,
    email: item.Email?.S,
    firstEntryAt: item.FirstEntryAt?.S ?? '',
    lastEntryAt: item.LastEntryAt?.S ?? '',
    entryCount: item.EntryCount?.N ? parseInt(item.EntryCount.N, 10) : 0,
  };
}

/** All entry rows for one campaign (one row per distinct user who entered). */
export async function listCampaignEntries(eid: string): Promise<EmailEntryRecord[]> {
  await ensureTable();
  const results: EmailEntryRecord[] = [];
  let lastKey: Record<string, AttributeValue> | undefined;
  do {
    const { Items = [], LastEvaluatedKey } = await client.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: '#eid = :eid',
        ExpressionAttributeNames: { '#eid': 'eid' },
        ExpressionAttributeValues: { ':eid': { S: eid } },
        ExclusiveStartKey: lastKey,
      }),
    );
    results.push(...Items.map((i) => itemToRecord(i as Record<string, AttributeValue>)));
    lastKey = LastEvaluatedKey as Record<string, AttributeValue> | undefined;
  } while (lastKey);
  return results;
}

export async function getCampaignSummary(eid: string): Promise<EmailCampaignSummary> {
  const entries = await listCampaignEntries(eid);
  return {
    eid,
    uniqueEntries: entries.length,
    totalEntries: entries.reduce((sum, e) => sum + e.entryCount, 0),
  };
}
