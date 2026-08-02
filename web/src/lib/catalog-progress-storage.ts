import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
  CreateTableCommand,
  DescribeTableCommand,
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

// Memoized so concurrent calls share one in-flight check instead of racing
// each other — but a *failed* attempt (e.g. a transient IAM/network issue)
// must not poison every request for the rest of the process's life. That
// happened for real: this table's IAM permissions were missing for a while,
// the first request's rejected promise got cached here, and — because a
// resolved/rejected Promise's outcome is immutable once settled — every
// later request kept replaying that exact same failure even after the IAM
// policy was fixed, until the next deploy finally restarted the process and
// cleared this module-level variable. Clearing it on failure lets the very
// next call retry instead of staying stuck until a restart.
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
    })().catch((e) => {
      _tableReady = null;
      throw e;
    });
  }
  return _tableReady;
}

export interface CatalogProgress {
  progress: string;
  cellSize?: number;
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
    cellSize: Item.cellSize?.N ? parseInt(Item.cellSize.N, 10) : undefined,
    updatedAt: Item.updatedAt?.S ?? '',
  };
}

export async function saveCatalogProgress(userId: string, designId: number, progressRle: string): Promise<void> {
  await ensureTable();
  if (progressRle.length > 350_000)
    throw new Error('Progress too large to save (exceeds 350 KB compressed)');

  // Partial update — leaves a previously-saved cellSize (if any) untouched.
  await client.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { userId: { S: userId }, designId: { N: String(designId) } },
    UpdateExpression: 'SET progress = :p, updatedAt = :t',
    ExpressionAttributeValues: {
      ':p': { S: progressRle },
      ':t': { S: new Date().toISOString() },
    },
  }));
}

// Lightweight partial update for the user's own zoom preference on this
// catalog design — kept separate from saveCatalogProgress (called far more
// often, on every stitch mark) so a zoom change never touches progress data.
export async function saveCatalogCellSize(userId: string, designId: number, cellSize: number): Promise<void> {
  await ensureTable();
  await client.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { userId: { S: userId }, designId: { N: String(designId) } },
    UpdateExpression: 'SET cellSize = :c, updatedAt = :t',
    ExpressionAttributeValues: {
      ':c': { N: String(cellSize) },
      ':t': { S: new Date().toISOString() },
    },
  }));
}
