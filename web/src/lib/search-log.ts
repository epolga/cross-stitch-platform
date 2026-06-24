import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const TABLE = process.env.DDB_SEARCH_QUERIES_TABLE || 'SearchQueries';
const TTL_DAYS = 90;

export interface SearchLogEntry {
  query: string;
  source: 'text' | 'image';
  hasResults: boolean;
  filters?: Record<string, unknown>;
}

export function logSearch(entry: SearchLogEntry): void {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const ts = `${now.toISOString()}#${Math.random().toString(36).slice(2, 9)}`;
  const ttl = Math.floor(now.getTime() / 1000) + TTL_DAYS * 86400;

  const item: Record<string, { S: string } | { BOOL: boolean } | { N: string }> = {
    date: { S: date },
    ts: { S: ts },
    query: { S: entry.query.slice(0, 500) },
    source: { S: entry.source },
    hasResults: { BOOL: entry.hasResults },
    ttl: { N: String(ttl) },
  };

  if (entry.filters) {
    (item as Record<string, unknown>).filters = { S: JSON.stringify(entry.filters) };
  }

  ddb.send(new PutItemCommand({ TableName: TABLE, Item: item }))
    .catch(err => console.error('[search-log] write failed:', err));
}
