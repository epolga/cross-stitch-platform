// src/lib/password-reset.ts
import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  DeleteItemCommand,
  UpdateItemCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import crypto from 'crypto';

const REGION = process.env.AWS_REGION || 'us-east-1';
const USERS_TABLE_NAME =
  process.env.DDB_USERS_TABLE || 'CrossStitchUsers';
const RESET_TABLE_NAME =
  process.env.DDB_RESET_TOKENS_TABLE || 'PasswordResetTokens';

const client = new DynamoDBClient({ region: REGION });

const RESET_TTL_SECONDS =
  Number(process.env.PASSWORD_RESET_TTL_SECONDS ?? '7200'); // 2 hours by default

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Checks that the user exists.
 * Just executes a GetItem call with the key ID = USR#email.
 */
export async function userExists(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const id = `USR#${normalized}`;

  const res = await client.send(
    new GetItemCommand({
      TableName: USERS_TABLE_NAME,
      Key: {
        ID: { S: id },
      },
      ProjectionExpression: 'ID',
    }),
  );

  return !!res.Item;
}

/**
 * Creates a reset token for the email and stores it in the PasswordResetTokens table.
 * Returns the token string.
 */
export async function createPasswordResetToken(
  email: string,
): Promise<string> {
  const normalized = normalizeEmail(email);
 console.log('Normalized email for token:', normalized);
  // Cryptographically strong token
  const token = crypto.randomBytes(32).toString('hex');
  console.log('RESET_TABLE_NAME :', RESET_TABLE_NAME);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + RESET_TTL_SECONDS;
 console.log('Normalized email for token:', normalized);
  const item: Record<string, AttributeValue> = {
    Token: { S: token },
    Email: { S: normalized },
    CreatedAt: { S: new Date().toISOString() },
    ExpiresAtEpoch: { N: String(expiresAt) },
  };

  await client.send(
    new PutItemCommand({
      TableName: RESET_TABLE_NAME,
      Item: item,
    }),
  );

  return token;
}

/**
 * Validates the token:
 *  - if there is no record or the token is expired — returns null
 *  - if it is valid — deletes it and returns the user's email
 */
export async function consumePasswordResetToken(
  token: string,
): Promise<string | null> {
  const res = await client.send(
    new GetItemCommand({
      TableName: RESET_TABLE_NAME,
      Key: {
        Token: { S: token },
      },
    }),
  );

  if (!res.Item) {
    return null;
  }

  const email = res.Item.Email?.S;
  const expiresAtRaw = res.Item.ExpiresAtEpoch?.N;

  if (!email || !expiresAtRaw) {
    // Something is wrong with the record — delete it just in case
    await client.send(
      new DeleteItemCommand({
        TableName: RESET_TABLE_NAME,
        Key: { Token: { S: token } },
      }),
    );
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(expiresAtRaw);

  if (Number.isNaN(expiresAt) || now > expiresAt) {
    // Token expired — delete it
    await client.send(
      new DeleteItemCommand({
        TableName: RESET_TABLE_NAME,
        Key: { Token: { S: token } },
      }),
    );
    return null;
  }

  // Token is valid — delete it immediately (single-use)
  await client.send(
    new DeleteItemCommand({
      TableName: RESET_TABLE_NAME,
      Key: { Token: { S: token } },
    }),
  );

  return email;
}

/**
 * Updates the user's password in CrossStitchUsers.
 * The Password field stays in the same format you currently use.
 */
export async function updateUserPassword(
  email: string,
  newPassword: string,
): Promise<void> {
  const normalized = normalizeEmail(email);
  const id = `USR#${normalized}`;

  await client.send(
    new UpdateItemCommand({
      TableName: USERS_TABLE_NAME,
      Key: {
        ID: { S: id },
      },
      UpdateExpression: 'SET #pwd = :pwd',
      ExpressionAttributeNames: {
        '#pwd': 'Password',
      },
      ExpressionAttributeValues: {
        ':pwd': { S: newPassword },
      },
    }),
  );
}

