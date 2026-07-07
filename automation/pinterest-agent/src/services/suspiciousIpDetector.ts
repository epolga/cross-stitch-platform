// Scans yesterday's ALB access logs for IPs whose request volume is far
// outside normal traffic, and alerts via Telegram. Deliberately alert-only —
// no auto-block. A false positive here (a legitimate high-volume crawler, a
// corporate NAT with many real users behind one IP) would silently drop real
// traffic, so a human decides via `npm run block-ip` after reviewing the
// alert. Revisit auto-block once the false-positive rate is known.

import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { gunzipSync } from "zlib";
import { queryRange, type BlockedIpRecord } from "./historyStore";
import { sendTelegramMessage } from "./telegramClient";

const LOG_BUCKET = "cross-stitch-logs";
const ACCOUNT_ID = "358174257684";
const REGION = "us-east-1";
// Known high-volume legitimate crawlers observed in practice: Googlebot
// (66.249.66.0/24, spread across many IPs, low per-IP volume) and Babbar SEO
// crawler (217.113.194.0/24, ~30-70 req/hr per IP — could approach this
// threshold if sustained at peak for a full day). Tune via env if either
// starts false-positiving.
const REQUEST_THRESHOLD = Number(process.env.SUSPICIOUS_IP_THRESHOLD ?? 800);

const s3 = new S3Client({ region: REGION });

function yesterdayUtc(): { y: string; m: string; d: string } {
  const d = new Date(Date.now() - 24 * 3600_000);
  return {
    y: String(d.getUTCFullYear()),
    m: String(d.getUTCMonth() + 1).padStart(2, "0"),
    d: String(d.getUTCDate()).padStart(2, "0"),
  };
}

async function listLogKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: LOG_BUCKET, Prefix: prefix, ContinuationToken: token })
    );
    for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key);
    token = res.NextContinuationToken;
  } while (token);
  return keys;
}

async function countRequestsByIp(keys: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const key of keys) {
    const res = await s3.send(new GetObjectCommand({ Bucket: LOG_BUCKET, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    const text = gunzipSync(Buffer.from(bytes)).toString("utf-8");
    for (const line of text.split("\n")) {
      if (!line) continue;
      // ALB log format: type time elb client:port target:port ...
      const clientPort = line.split(" ")[3];
      const ip = clientPort?.split(":")[0];
      if (!ip) continue;
      counts.set(ip, (counts.get(ip) ?? 0) + 1);
    }
  }
  return counts;
}

export interface SuspiciousIpResult {
  checked: boolean;
  reason?: string;
  flagged: { ip: string; count: number }[];
}

export async function detectSuspiciousIps(): Promise<SuspiciousIpResult> {
  const { y, m, d } = yesterdayUtc();
  const prefix = `alb-logs/AWSLogs/${ACCOUNT_ID}/elasticloadbalancing/${REGION}/${y}/${m}/${d}/`;

  const keys = await listLogKeys(prefix);
  if (keys.length === 0) {
    return { checked: false, reason: `no ALB logs found for ${y}-${m}-${d}`, flagged: [] };
  }

  const counts = await countRequestsByIp(keys);
  const alreadyBlocked = new Set(
    (await queryRange<BlockedIpRecord>("BLOCKED_IP")).map((r) => r.ip)
  );

  const flagged = [...counts.entries()]
    .filter(([ip, count]) => count >= REQUEST_THRESHOLD && !alreadyBlocked.has(ip))
    .map(([ip, count]) => ({ ip, count }))
    .sort((a, b) => b.count - a.count);

  if (flagged.length > 0) {
    const lines = [
      `🤖 <b>${flagged.length} suspicious IP(s)</b> — ${y}-${m}-${d} (≥${REQUEST_THRESHOLD} req/day)`,
      ...flagged.slice(0, 10).map((f) => `${f.ip}: ${f.count} req`),
      "",
      `Review, then: npm run block-ip -- &lt;ip&gt; "&lt;reason&gt;"`,
    ];
    await sendTelegramMessage(lines.join("\n")).catch(() => {/* non-fatal */});
  }

  return { checked: true, flagged };
}
