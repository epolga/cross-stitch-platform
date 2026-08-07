import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const TABLE = process.env.DDB_SEARCH_QUERIES_TABLE || 'SearchQueries';
const TTL_DAYS = 90;

export interface SearchLogEntry {
  query: string;
  source: 'text' | 'image';
  hasResults: boolean;
  filters?: Record<string, unknown>;
}

// `date` is always exactly 10 chars (YYYY-MM-DD); `|` at index 10 just
// keeps the two halves visually separable, splitting is done by position.
function buildSearchId(date: string, ts: string): string {
  return `${date}|${ts}`;
}

function parseSearchId(searchId: string): { date: string; ts: string } | null {
  if (searchId.length < 12 || searchId[10] !== '|') return null;
  return { date: searchId.slice(0, 10), ts: searchId.slice(11) };
}

// Returns the searchId so a caller can later attach the final, merged
// retrieved-list via logSearchResults() once it's known (see page.tsx —
// the ranked list a search API route sees isn't necessarily what's
// actually displayed after filter/semantic merge).
export function logSearch(entry: SearchLogEntry): string {
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

  return buildSearchId(date, ts);
}

// Attaches the design IDs actually shown to the user, in display order,
// once the caller's own filter/semantic merge has settled on a final
// list — see the page.tsx call site.
export function logSearchResults(searchId: string, retrievedIds: number[]): void {
  const parsed = parseSearchId(searchId);
  if (!parsed) {
    console.error('[search-log] logSearchResults: malformed searchId:', searchId);
    return;
  }
  ddb.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { date: { S: parsed.date }, ts: { S: parsed.ts } },
    UpdateExpression: 'SET retrievedIds = :r',
    ExpressionAttributeValues: { ':r': { S: JSON.stringify(retrievedIds) } },
  })).catch(err => console.error('[search-log] logSearchResults write failed:', err));
}
