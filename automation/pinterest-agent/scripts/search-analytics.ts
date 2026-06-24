import "dotenv/config";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const TABLE = process.env.DDB_SEARCH_QUERIES_TABLE || "SearchQueries";
const DAYS = parseInt(process.argv[2] ?? "30", 10);

interface Row {
  date: string;
  query: string;
  source: "text" | "image";
  hasResults: boolean;
}

async function fetchRows(since: string): Promise<Row[]> {
  const rows: Row[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const resp = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: "#date >= :since",
      ExpressionAttributeNames: { "#date": "date" },
      ExpressionAttributeValues: { ":since": { S: since } },
      ExclusiveStartKey: lastKey as never,
    }));

    for (const item of resp.Items ?? []) {
      const query = item.query?.S ?? item.rawQuery?.S ?? "";
      if (!query) continue;
      rows.push({
        date: item.date?.S ?? "",
        query,
        source: (item.source?.S as "text" | "image") ?? "text",
        hasResults: item.hasResults?.BOOL ?? true,
      });
    }

    lastKey = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return rows;
}

function sinceDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const since = sinceDate(DAYS);
  console.log(`\nSearch analytics — last ${DAYS} days (since ${since})\n`);

  const rows = await fetchRows(since);
  if (rows.length === 0) {
    console.log("No search logs found.");
    return;
  }

  console.log(`Total searches: ${rows.length}`);
  console.log(`  Text: ${rows.filter(r => r.source === "text").length}`);
  console.log(`  Image: ${rows.filter(r => r.source === "image").length}`);
  const zeroResults = rows.filter(r => !r.hasResults);
  console.log(`  Zero-result: ${zeroResults.length} (${((zeroResults.length / rows.length) * 100).toFixed(1)}%)\n`);

  // Top queries by frequency
  const freq = new Map<string, number>();
  for (const r of rows) {
    const key = r.query.toLowerCase().trim();
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  const top = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log("Top 20 queries:");
  for (const [q, count] of top) {
    console.log(`  ${count.toString().padStart(4)}x  ${q}`);
  }

  // Zero-result queries
  if (zeroResults.length > 0) {
    const zeroFreq = new Map<string, number>();
    for (const r of zeroResults) {
      const key = r.query.toLowerCase().trim();
      zeroFreq.set(key, (zeroFreq.get(key) ?? 0) + 1);
    }
    const topZero = Array.from(zeroFreq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log("\nTop zero-result queries (opportunity to add designs):");
    for (const [q, count] of topZero) {
      console.log(`  ${count.toString().padStart(4)}x  ${q}`);
    }
  }

  // Daily volume (last 14 days)
  const dailyVol = new Map<string, number>();
  for (const r of rows) {
    dailyVol.set(r.date, (dailyVol.get(r.date) ?? 0) + 1);
  }
  const days = Array.from(dailyVol.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  console.log("\nDaily search volume (last 14 days):");
  for (const [date, count] of days) {
    const bar = "█".repeat(Math.min(count, 40));
    console.log(`  ${date}  ${bar} ${count}`);
  }
}

main().catch(console.error);
