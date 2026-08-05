// Reads/refreshes the Pinterest OAuth token stored in DynamoDB table
// CrossStitchBusinessHistory (EntityType=PINTEREST_TOKEN, SortKey=CURRENT).
// Same record automation/pinterest-agent's historyStore.ts/pinterestTokenManager.ts
// read — ported here (not imported) since automation/pinterest-agent is a
// separate package with its own node_modules/tsconfig.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE = process.env.HISTORY_TABLE_NAME || 'CrossStitchBusinessHistory';
const REFRESH_THRESHOLD_DAYS = 7;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

interface PinterestTokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at_utc: string;
  scope: string;
  writtenAt: string;
  refreshedAt?: string;
}

async function getPinterestToken(): Promise<PinterestTokenRecord | null> {
  const res = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { EntityType: 'PINTEREST_TOKEN', SortKey: 'CURRENT' },
  }));
  return (res.Item as PinterestTokenRecord | undefined) ?? null;
}

async function putPinterestToken(token: Omit<PinterestTokenRecord, 'writtenAt'>): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      EntityType: 'PINTEREST_TOKEN',
      SortKey: 'CURRENT',
      ...token,
      writtenAt: new Date().toISOString(),
    },
  }));
}

function daysUntilExpiry(expiresAtUtc: string): number {
  return (new Date(expiresAtUtc).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
}

async function callRefreshEndpoint(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}> {
  const clientId = process.env.PINTEREST_CLIENT_ID;
  const clientSecret = process.env.PINTEREST_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('PINTEREST_CLIENT_ID and PINTEREST_CLIENT_SECRET env vars required for token refresh');
  }
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  });
  if (!res.ok) {
    throw new Error(`Pinterest token refresh HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number; scope: string }>;
}

// Returns a valid Pinterest access token, refreshing it (and persisting the
// refreshed token back to DynamoDB) if it expires within REFRESH_THRESHOLD_DAYS.
export async function getValidPinterestAccessToken(): Promise<string> {
  const record = await getPinterestToken();
  if (!record) {
    throw new Error('No Pinterest token found in DynamoDB (CrossStitchBusinessHistory[PINTEREST_TOKEN]).');
  }

  const days = daysUntilExpiry(record.expires_at_utc);
  if (days > REFRESH_THRESHOLD_DAYS) {
    return record.access_token;
  }

  const newTokenData = await callRefreshEndpoint(record.refresh_token);
  const expiresAtUtc = new Date(Date.now() + newTokenData.expires_in * 1000).toISOString();

  await putPinterestToken({
    access_token: newTokenData.access_token,
    refresh_token: newTokenData.refresh_token,
    expires_at_utc: expiresAtUtc,
    scope: newTokenData.scope,
    refreshedAt: new Date().toISOString(),
  });

  return newTokenData.access_token;
}
