import {
  DynamoDBClient,
  UpdateItemCommand,
  GetItemCommand,
  CreateTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';

const TABLE = process.env.DDB_BLOG_REACTIONS_TABLE || 'CrossStitchBlogReactions';
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
          KeySchema: [{ AttributeName: 'slug', KeyType: 'HASH' }],
          AttributeDefinitions: [{ AttributeName: 'slug', AttributeType: 'S' }],
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

export async function getReactionCount(slug: string): Promise<number> {
  await ensureTable();
  const { Item } = await client.send(new GetItemCommand({ TableName: TABLE, Key: { slug: { S: slug } } }));
  return Item?.count?.N ? parseInt(Item.count.N, 10) : 0;
}

export async function incrementReaction(slug: string): Promise<number> {
  await ensureTable();
  const { Attributes } = await client.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { slug: { S: slug } },
      UpdateExpression: 'ADD #c :one',
      ExpressionAttributeNames: { '#c': 'count' },
      ExpressionAttributeValues: { ':one': { N: '1' } },
      ReturnValues: 'ALL_NEW',
    }),
  );
  return Attributes?.count?.N ? parseInt(Attributes.count.N, 10) : 1;
}
