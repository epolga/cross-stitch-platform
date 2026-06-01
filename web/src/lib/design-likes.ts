import {
  AttributeValue,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const LIKES_TABLE_NAME = process.env.DDB_LIKES_TABLE || 'CrossStitchLikes';
const LIKES_USER_GSI_NAME = process.env.DDB_LIKES_USER_GSI_NAME || 'GSI1';

const client = new DynamoDBClient({ region: REGION });

export interface DesignLikeState {
  count: number;
  currentUserVote: 'up' | 'down' | null;
}

export interface UserDesignVote {
  designId: number;
  voteDirection: 'up' | 'down';
  createdAt?: string;
  updatedAt?: string;
}

type StoredVote = 'up' | 'down' | null;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length > 3 && normalized.includes('@') && normalized.includes('.');
}

function designPk(designId: number): string {
  return `DESIGN#${designId}`;
}

function userSk(email: string): string {
  return `USER#${normalizeEmail(email)}`;
}

function userGsiPk(email: string): string {
  return `USER#${normalizeEmail(email)}`;
}

function designGsiSk(designId: number): string {
  return `DESIGN#${designId}`;
}

export function ensureValidLikeEmail(email: string): string {
  if (!isValidEmail(email)) {
    throw new Error('Valid email is required');
  }
  return normalizeEmail(email);
}

function parseStoredVote(item?: Record<string, AttributeValue>): StoredVote {
  const voteDirection = item?.VoteDirection?.S;
  if (voteDirection === 'up' || voteDirection === 'down') {
    return voteDirection;
  }

  const voteValue = item?.VoteValue?.N;
  if (voteValue === '1') {
    return 'up';
  }
  if (voteValue === '-1') {
    return 'down';
  }

  if (item?.EntityType?.S === 'LIKE') {
    return 'up';
  }

  return null;
}

function parseStoredDesignId(item?: Record<string, AttributeValue>): number | null {
  const directDesignId = item?.DesignID?.N;
  if (directDesignId) {
    const parsedDesignId = parseInt(directDesignId, 10);
    if (!Number.isNaN(parsedDesignId) && parsedDesignId > 0) {
      return parsedDesignId;
    }
  }

  const gsiDesignKey = item?.GSI1SK?.S;
  if (!gsiDesignKey || !gsiDesignKey.startsWith('DESIGN#')) {
    return null;
  }

  const parsedDesignId = parseInt(gsiDesignKey.slice('DESIGN#'.length), 10);
  return Number.isNaN(parsedDesignId) || parsedDesignId <= 0 ? null : parsedDesignId;
}

export async function getDesignLikeCount(designId: number): Promise<number> {
  const response = await client.send(
    new QueryCommand({
      TableName: LIKES_TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: designPk(designId) },
      },
      ProjectionExpression: 'VoteDirection, VoteValue, EntityType',
    }),
  );

  return (response.Items ?? []).reduce((total, item) => {
    const vote = parseStoredVote(item);
    if (vote === 'up') {
      return total + 1;
    }
    if (vote === 'down') {
      return total - 1;
    }
    return total;
  }, 0);
}

export async function getUserDesignVote(designId: number, email: string): Promise<StoredVote> {
  const normalizedEmail = ensureValidLikeEmail(email);
  const response = await client.send(
    new GetItemCommand({
      TableName: LIKES_TABLE_NAME,
      Key: {
        PK: { S: designPk(designId) },
        SK: { S: userSk(normalizedEmail) },
      },
      ProjectionExpression: 'VoteDirection, VoteValue, EntityType',
    }),
  );

  return parseStoredVote(response.Item);
}

export async function getDesignLikeState(designId: number, email?: string): Promise<DesignLikeState> {
  const count = await getDesignLikeCount(designId);
  if (!email) {
    return {
      count,
      currentUserVote: null,
    };
  }

  const currentUserVote = await getUserDesignVote(designId, email);
  return {
    count,
    currentUserVote,
  };
}

export async function getUserDesignVotes(email: string): Promise<UserDesignVote[]> {
  const normalizedEmail = ensureValidLikeEmail(email);
  const votes: UserDesignVote[] = [];
  let lastEvaluatedKey: Record<string, AttributeValue> | undefined;

  do {
    const response = await client.send(
      new QueryCommand({
        TableName: LIKES_TABLE_NAME,
        IndexName: LIKES_USER_GSI_NAME,
        KeyConditionExpression: 'GSI1PK = :gsi1pk',
        ExpressionAttributeValues: {
          ':gsi1pk': { S: userGsiPk(normalizedEmail) },
        },
        ProjectionExpression: 'DesignID, GSI1SK, VoteDirection, VoteValue, EntityType, CreatedAt, UpdatedAt',
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    for (const item of response.Items ?? []) {
      const designId = parseStoredDesignId(item);
      const voteDirection = parseStoredVote(item);

      if (!designId || (voteDirection !== 'up' && voteDirection !== 'down')) {
        continue;
      }

      votes.push({
        designId,
        voteDirection,
        createdAt: item.CreatedAt?.S,
        updatedAt: item.UpdatedAt?.S,
      });
    }

    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return votes.sort((left, right) => {
    const leftTimestamp = left.updatedAt || left.createdAt || '';
    const rightTimestamp = right.updatedAt || right.createdAt || '';
    return rightTimestamp.localeCompare(leftTimestamp);
  });
}

async function putDesignVote(designId: number, email: string, vote: Exclude<StoredVote, null>): Promise<void> {
  const normalizedEmail = ensureValidLikeEmail(email);
  const now = new Date().toISOString();
  const voteValue = vote === 'up' ? '1' : '-1';

  await client.send(
    new PutItemCommand({
      TableName: LIKES_TABLE_NAME,
      Item: {
        PK: { S: designPk(designId) },
        SK: { S: userSk(normalizedEmail) },
        GSI1PK: { S: userGsiPk(normalizedEmail) },
        GSI1SK: { S: designGsiSk(designId) },
        EntityType: { S: 'VOTE' },
        DesignID: { N: String(designId) },
        UserEmail: { S: normalizedEmail },
        VoteDirection: { S: vote },
        VoteValue: { N: voteValue },
        CreatedAt: { S: now },
        UpdatedAt: { S: now },
      },
    }),
  );
}

export async function removeDesignLike(designId: number, email: string): Promise<void> {
  const normalizedEmail = ensureValidLikeEmail(email);

  await client.send(
    new DeleteItemCommand({
      TableName: LIKES_TABLE_NAME,
      Key: {
        PK: { S: designPk(designId) },
        SK: { S: userSk(normalizedEmail) },
      },
    }),
  );
}

export async function setDesignVote(
  designId: number,
  email: string,
  requestedVote: Exclude<StoredVote, null>,
): Promise<DesignLikeState> {
  const currentVote = await getUserDesignVote(designId, email);

  if (currentVote === requestedVote) {
    return getDesignLikeState(designId, email);
  }

  if (currentVote === null) {
    await putDesignVote(designId, email, requestedVote);
    return getDesignLikeState(designId, email);
  }

  await removeDesignLike(designId, email);

  return getDesignLikeState(designId, email);
}

export function isConditionalCheckFailure(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  return (
    name === 'ConditionalCheckFailedException' ||
    message.includes('ConditionalCheckFailed') ||
    message.includes('ConditionalCheckFailedException')
  );
}

export function isResourceNotFound(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  return name === 'ResourceNotFoundException' || message.includes('ResourceNotFoundException');
}
