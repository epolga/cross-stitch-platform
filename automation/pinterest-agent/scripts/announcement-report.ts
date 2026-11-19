// Report for a mass announcement send: SES totals, GA4 by utm_content, site
// entry events. Emails it to the admin. Usage:
//   npx tsx scripts/announcement-report.ts --eid 261117 --since 2026-11-17 \
//     --sent-at 2026-11-17T16:30:00Z --label "1-day" [--no-email]
// Run by Windows Task Scheduler for the 2026-11-17 Christmas announcement
// (see docs/session-log or Email_Content_Plan.md for the send details).

import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { analyticsData, GA4_PROPERTY_ID } from "../src/services/googleClient";
import { sendEmail } from "../src/services/sesClient";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : "true";
}

const eid = arg("eid", "261117")!;
const since = arg("since", "2026-11-17")!;
const sentAt = new Date(arg("sent-at", "2026-11-17T16:30:00Z")!);
const label = arg("label", "report")!;
const noEmail = arg("no-email") === "true";
const SENDER = "ann@cross-stitch.com";
const RECIPIENT = "olga.epstein@gmail.com";
const SEND_LOG = path.resolve(__dirname, "../../../uploader/UploaderCli/send-log-announcement.jsonl");

async function sesTotals(): Promise<string[]> {
  const out = execFileSync("aws", ["ses", "get-send-statistics", "--region", "us-east-1", "--output", "json"], {
    encoding: "utf8",
  });
  const points: { Timestamp: string; DeliveryAttempts: number; Bounces: number; Complaints: number; Rejects: number }[] =
    JSON.parse(out).SendDataPoints;
  const mine = points.filter(p => new Date(p.Timestamp) >= sentAt);
  const sum = (k: "DeliveryAttempts" | "Bounces" | "Complaints" | "Rejects") => mine.reduce((a, p) => a + p[k], 0);
  const attempts = sum("DeliveryAttempts");
  const bounces = sum("Bounces");
  const complaints = sum("Complaints");
  const pct = (n: number) => (attempts ? ((n / attempts) * 100).toFixed(2) + "%" : "n/a");
  return [
    `SES, account-wide since ${sentAt.toISOString()} (includes any other mail sent since):`,
    `  delivery attempts: ${attempts}`,
    `  bounces: ${bounces} (${pct(bounces)})`,
    `  complaints: ${complaints} (${pct(complaints)})`,
    `  rejects: ${sum("Rejects")}`,
  ];
}

function sentCount(): string {
  if (!existsSync(SEND_LOG)) return `Send log not found at ${SEND_LOG}`;
  const n = readFileSync(SEND_LOG, "utf8")
    .split("\n")
    .filter(l => l.includes(`"eid":"${eid}"`)).length;
  return `Send log: ${n} emails logged for eid=${eid}`;
}

async function ga4(): Promise<string[]> {
  const res = await analyticsData.properties.runReport({
    property: `properties/${GA4_PROPERTY_ID}`,
    requestBody: {
      dateRanges: [{ startDate: since, endDate: "today" }],
      dimensions: [{ name: "date" }, { name: "sessionManualAdContent" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "screenPageViews" }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: "pagePathPlusQueryString", stringFilter: { matchType: "CONTAINS", value: `eid=${eid}` } } },
            {
              notExpression: {
                filter: { fieldName: "pagePathPlusQueryString", stringFilter: { matchType: "CONTAINS", value: "cid=admin" } },
              },
            },
          ],
        },
      },
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: "1000",
    },
  });
  const rows = res.data.rows ?? [];
  const lines = [`GA4 (eid=${eid}, excluding cid=admin), date | utm_content | sessions | users | pageviews:`];
  let s = 0, u = 0, p = 0;
  for (const r of rows) {
    const d = r.dimensionValues?.map(v => v.value || "(not set)") ?? [];
    const m = r.metricValues?.map(v => parseInt(v.value || "0", 10)) ?? [];
    lines.push(`  ${d.join(" | ")} | ${m.join(" | ")}`);
    s += m[0]; u += m[1]; p += m[2];
  }
  if (!rows.length) lines.push("  (no rows yet — GA4 standard reports can lag several hours)");
  else lines.push(`  total (users may double-count across days/content): sessions ${s}, users ${u}, pageviews ${p}`);
  return lines;
}

async function entries(): Promise<string[]> {
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));
  const items: Record<string, unknown>[] = [];
  let key: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new ScanCommand({
        TableName: "EmailEntryEvents",
        FilterExpression: "eid = :e",
        ExpressionAttributeValues: { ":e": eid },
        ExclusiveStartKey: key,
      })
    );
    items.push(...((r.Items as Record<string, unknown>[]) ?? []));
    key = r.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (key);
  const real = items.filter(i => i.cid !== "admin");
  const total = real.reduce((a, i) => a + Number(i.EntryCount ?? 0), 0);
  return [
    `Site entry events (EmailEntryEvents, eid=${eid}, excluding admin):`,
    `  distinct recipients who entered: ${real.length}`,
    `  total entries: ${total}`,
  ];
}

(async () => {
  const sections: string[][] = [];
  const run = async (name: string, f: () => Promise<string[]> | string[]) => {
    try {
      sections.push(await f());
    } catch (e) {
      sections.push([`${name} failed: ${(e as Error).message}`]);
    }
  };
  await run("SES", sesTotals);
  await run("Send log", () => [sentCount()]);
  await run("GA4", ga4);
  await run("DDB", entries);

  const body = [`Announcement eid=${eid} — ${label} report`, `Generated ${new Date().toISOString()}`, "", ...sections.flatMap(s => [...s, ""])].join("\n");
  console.log(body);
  if (noEmail) return;
  const r = await sendEmail({
    subject: `Announcement ${eid}: ${label} report`,
    textBody: body,
    sender: SENDER,
    recipient: RECIPIENT,
  });
  console.log(`Emailed to ${RECIPIENT}, MessageId ${r.messageId}`);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
