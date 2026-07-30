import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  CreateTableCommand,
  DescribeTableCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';

// Stitch-progress marks for a catalog design the user hasn't (or hasn't yet)
// saved a personal copy of. Deliberately separate from ConverterPatterns:
// this table never stores grid/palette, only the small per-user progress
// delta — the design's own grid/palette is re-fetched from the catalog
// pattern route each time. If the user later saves a modified copy, its
// progress moves into ConverterPatterns' own progress field (see
// ConvertClient's post-save transfer) and this row becomes stale/unused —
// left in place rather than deleted, since a future viewer of the same
// unmodified catalog design should still see it.
const TABLE  = process.env.DDB_CATALOG_PROGRESS_TABLE || 'ConverterCatalogProgress';
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
        KeySchema: [
          { AttributeName: 'userId', KeyType: 'HASH' },
          { AttributeName: 'designId', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'userId', AttributeType: 'S' },
          { AttributeName: 'designId', AttributeType: 'N' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      }));
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const { Table } = await client.send(new DescribeTableCommand({ TableName: TABLE }));
        if (Table?.TableStatus === 'ACTIVE') break;
      }
    }
  })());
}

export interface CatalogProgress {
  progress: string;
  updatedAt: string;
}

export async function getCatalogProgress(userId: string, designId: number): Promise<CatalogProgress | null> {
  await ensureTable();
  const { Item } = await client.send(new GetItemCommand({
    TableName: TABLE,
    Key: { userId: { S: userId }, designId: { N: String(designId) } },
  }));
  if (!Item) return null;
  return {
    progress: Item.progress?.S ?? '',
    updatedAt: Item.updatedAt?.S ?? '',
  };
}

export async function saveCatalogProgress(userId: string, designId: number, progressRle: string): Promise<void> {
  await ensureTable();
  if (progressRle.length > 350_000)
    throw new Error('Progress too large to save (exceeds 350 KB compressed)');

  const item: Record<string, AttributeValue> = {
    userId:    { S: userId },
    designId:  { N: String(designId) },
    progress:  { S: progressRle },
    updatedAt: { S: new Date().toISOString() },
  };
  await client.send(new PutItemCommand({ TableName: TABLE, Item: item }));
}
