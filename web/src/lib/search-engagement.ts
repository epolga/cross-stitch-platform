import {
  DynamoDBClient,
  UpdateItemCommand,
  QueryCommand,
  CreateTableCommand,
  DescribeTableCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';

const TABLE = process.env.DDB_SEARCH_ENGAGEMENT_TABLE || 'SearchEngagement';
const REGION = process.env.AWS_REGION || 'us-east-1';
const client = new DynamoDBClient({ region: REGION });
const TTL_DAYS = 90;

let tableReady: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      try {
        await client.send(new DescribeTableCommand({ TableName: TABLE }));
      } catch (e: unknown) {
        if ((e as { name?: string })?.name !== 'ResourceNotFoundException') throw e;
        await client.send(
          new CreateTableCommand({
            TableName: TABLE,
            KeySchema: [
              { AttributeName: 'searchId', KeyType: 'HASH' },
              { AttributeName: 'designId', KeyType: 'RANGE' },
            ],
            AttributeDefinitions: [
              { AttributeName: 'searchId', AttributeType: 'S' },
              { AttributeName: 'designId', AttributeType: 'S' },
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
    })().catch((e) => {
      tableReady = null;
      throw e;
    });
  }
  return tableReady;
}

export type EngagementAction = 'click' | 'download';

// Relevance weight for the eventual retrieval-eval consumer (Track 1 Step 3
// Part C, not built yet) — a download is a stronger relevance signal than a
// click, per Olga's call 2026-08-07.
const WEIGHT: Record<EngagementAction, number> = { click: 1, download: 2 };

export interface SearchEngagementRecord {
  searchId: string;
  designId: number;
  action: EngagementAction;
  weight: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Records a relevance signal for one (searchId, designId) pair — one row
 * per pair, not one per event. A click establishes relevance; a later
 * download on the same pair upgrades the weight. The condition expression
 * only ever raises weight, never lowers it, so a click arriving after an
 * earlier download (e.g. the user re-clicks back into the result list)
 * doesn't erase the stronger download signal already on record.
 */
export async function logSearchEngagement(
  searchId: string,
  designId: number,
  action: EngagementAction,
): Promise<void> {
  await ensureTable();
  const now = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + TTL_DAYS * 86400;
  const weight = WEIGHT[action];

  try {
    await client.send(new UpdateItemCommand({
      TableName: TABLE,
      Key: { searchId: { S: searchId }, designId: { S: String(designId) } },
      UpdateExpression:
        'SET #a = :a, #w = :w, updatedAt = :now, createdAt = if_not_exists(createdAt, :now), #ttl = :ttl',
      ConditionExpression: 'attribute_not_exists(#w) OR #w < :w',
      ExpressionAttributeNames: { '#a': 'action', '#w': 'weight', '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':a': { S: action },
        ':w': { N: String(weight) },
        ':now': { S: now },
        ':ttl': { N: String(ttl) },
      },
    }));
  } catch (e: unknown) {
    // Benign: an equal-or-higher-weight signal already exists for this pair.
    if ((e as { name?: string })?.name !== 'ConditionalCheckFailedException') throw e;
  }
}

function itemToRecord(item: Record<string, AttributeValue>): SearchEngagementRecord {
  return {
    searchId: item.searchId.S!,
    designId: parseInt(item.designId.S!, 10),
    action: item.action.S as EngagementAction,
    weight: item.weight?.N ? parseInt(item.weight.N, 10) : 0,
    createdAt: item.createdAt?.S ?? '',
    updatedAt: item.updatedAt?.S ?? '',
  };
}

/** All engagement rows for one search — the future /evaluate consumer's ground truth. */
export async function listEngagementForSearch(searchId: string): Promise<SearchEngagementRecord[]> {
  await ensureTable();
  const results: SearchEngagementRecord[] = [];
  let lastKey: Record<string, AttributeValue> | undefined;
  do {
    const { Items = [], LastEvaluatedKey } = await client.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: '#s = :s',
      ExpressionAttributeNames: { '#s': 'searchId' },
      ExpressionAttributeValues: { ':s': { S: searchId } },
      ExclusiveStartKey: lastKey,
    }));
    results.push(...Items.map(i => itemToRecord(i as Record<string, AttributeValue>)));
    lastKey = LastEvaluatedKey as Record<string, AttributeValue> | undefined;
  } while (lastKey);
  return results;
}
