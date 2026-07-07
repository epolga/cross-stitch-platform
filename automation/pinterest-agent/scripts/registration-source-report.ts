// Counts new registrations grouped by RegistrationSource (design-download,
// converter-download, converter-save, etc.) — lets us compare real
// conversion by the UI action that triggered the registration wall, instead
// of guessing from traffic volume alone.
// Usage:  npm run reg-source                 (last 30 days)
//         npm run reg-source -- --days 7      (last 7 days)
import "dotenv/config";
import {
  DynamoDBClient,
  ScanCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";

const REGION = process.env.AWS_REGION || "us-east-1";
const USERS_TABLE_NAME = process.env.DDB_USERS_TABLE || "CrossStitchUsers";
const client = new DynamoDBClient({ region: REGION });

interface UserRow {
  createdAt: string;
  registrationSource?: string;
  verified: boolean;
}

async function scanUsers(): Promise<UserRow[]> {
  const rows: UserRow[] = [];
  let lastKey: Record<string, AttributeValue> | undefined;
  do {
    const res = await client.send(
      new ScanCommand({
        TableName: USERS_TABLE_NAME,
        ProjectionExpression: "CreatedAt, RegistrationSource, Verified",
        ExclusiveStartKey: lastKey,
      })
    );
    for (const item of res.Items ?? []) {
      if (!item.CreatedAt?.S) continue;
      rows.push({
        createdAt: item.CreatedAt.S,
        registrationSource: item.RegistrationSource?.S,
        verified: item.Verified?.BOOL ?? false,
      });
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return rows;
}

async function run() {
  const daysArg = (() => {
    const idx = process.argv.indexOf("--days");
    const v = idx !== -1 ? Number(process.argv[idx + 1]) : NaN;
    return Number.isFinite(v) && v > 0 ? v : 30;
  })();

  const cutoff = new Date(Date.now() - daysArg * 86400_000).toISOString();
  const all = await scanUsers();
  const rows = all.filter((r) => r.createdAt >= cutoff);

  if (rows.length === 0) {
    console.log(`No registrations in the last ${daysArg} day(s).`);
    return;
  }

  const bySource = new Map<string, { count: number; verified: number }>();
  for (const r of rows) {
    const key = r.registrationSource || "(untracked — before source tracking)";
    const bucket = bySource.get(key) ?? { count: 0, verified: 0 };
    bucket.count++;
    if (r.verified) bucket.verified++;
    bySource.set(key, bucket);
  }

  const entries = [...bySource.entries()].sort((a, b) => b[1].count - a[1].count);

  console.log(`\n── Registrations by source, last ${daysArg} day(s) ──`);
  console.log("Source                                       Count  Verified  Verified%");
  console.log("───────────────────────────────────────────  ─────  ────────  ─────────");
  let totCount = 0, totVerified = 0;
  for (const [source, { count, verified }] of entries) {
    const pct = count > 0 ? ((verified / count) * 100).toFixed(0) + "%" : "-";
    console.log(
      `${source.padEnd(45)}  ${String(count).padStart(5)}  ${String(verified).padStart(8)}  ${pct.padStart(9)}`
    );
    totCount += count;
    totVerified += verified;
  }
  console.log("───────────────────────────────────────────  ─────  ────────  ─────────");
  const totPct = totCount > 0 ? ((totVerified / totCount) * 100).toFixed(0) + "%" : "-";
  console.log(`${"TOTAL".padEnd(45)}  ${String(totCount).padStart(5)}  ${String(totVerified).padStart(8)}  ${totPct.padStart(9)}`);
}

run().catch(console.error);
