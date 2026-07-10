// CLI: npx tsx scripts/analyze-ip.ts <ip-or-raw-pasted-block> [--date=YYYY-MM-DD]
//   or: echo "<pasted block>" | npx tsx scripts/analyze-ip.ts [--date=YYYY-MM-DD]
//   or (most robust on Windows for multi-line input):
//     cat <<'EOF' | npx tsx scripts/analyze-ip.ts --date=YYYY-MM-DD
//     101.53.238.13: 12827 req
//     70.178.10.197: 4376 req
//     EOF
//
// Accepts IPs in any shape — bare, space-separated, one per line, with
// "ip: N req" suffixes straight from the Telegram alert — it just extracts
// every IPv4-looking token from the input (argv and/or stdin, both are read
// and merged). Prefer piping via stdin (heredoc) for multi-line input on
// Windows: `npx` there is npx.cmd, a batch file, and batch-file argument
// parsing truncates a quoted CLI argument at its first embedded newline —
// stdin isn't subject to that.
//
// Evidence-gathering for IP block/watch decisions: reverse DNS plus a
// breakdown of yesterday's (or --date's) ALB access logs for the given IPs —
// HTTP methods, status codes, and top requested paths. Read-only; does not
// block or watch anything itself. Pair with `npm run block-ip` / `npm run
// watch-ip` once a human (or the /review-ip skill) has decided.

import "dotenv/config";
import { execFile } from "child_process";
import { promisify } from "util";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { gunzipSync } from "zlib";

const execFileAsync = promisify(execFile);

// Node's built-in dns.reverse() fails on this machine's resolver setup
// (ENOTFOUND even for records that genuinely resolve) — shell out to the OS
// `nslookup`, which works, instead.
async function reverseDns(ip: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("nslookup", [ip]);
    // Windows nslookup: "Name:    host.domain"; Unix nslookup: "name = host.domain"
    const match = stdout.match(/name\s*[:=]\s*(\S+)/i);
    return match ? match[1].replace(/\.$/, "") : null;
  } catch {
    return null;
  }
}

const LOG_BUCKET = "cross-stitch-logs";
const ACCOUNT_ID = "358174257684";
const REGION = "us-east-1";
const s3 = new S3Client({ region: REGION });

const args = process.argv.slice(2);
const dateArg = args.find((a) => a.startsWith("--date="))?.split("=")[1];

function extractIps(blob: string): string[] {
  return [...new Set(blob.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) ?? [])];
}

async function readStdinIfPiped(): Promise<string> {
  if (process.stdin.isTTY) return ""; // nothing piped in, don't hang waiting for input
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

function targetDate(): { y: string; m: string; d: string } {
  const d = dateArg ? new Date(dateArg + "T00:00:00Z") : new Date(Date.now() - 24 * 3600_000);
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
    const res = await s3.send(new ListObjectsV2Command({ Bucket: LOG_BUCKET, Prefix: prefix, ContinuationToken: token }));
    for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key);
    token = res.NextContinuationToken;
  } while (token);
  return keys;
}

interface IpStats {
  methods: Map<string, number>;
  paths: Map<string, number>;
  statuses: Map<string, number>;
  total: number;
}

(async () => {
  const argvBlob = args.filter((a) => !a.startsWith("--")).join(" ");
  const stdinBlob = await readStdinIfPiped();
  const targetIps = [...new Set([...extractIps(argvBlob), ...extractIps(stdinBlob)])];

  if (targetIps.length === 0) {
    console.error('Usage: npx tsx scripts/analyze-ip.ts <ip-or-pasted-block> [--date=YYYY-MM-DD]');
    console.error('   or: cat <<\'EOF\' | npx tsx scripts/analyze-ip.ts --date=YYYY-MM-DD  (multi-line, most robust)');
    console.error('No IPv4 addresses found in the input — paste the raw alert text or bare IPs, either works.');
    process.exit(1);
  }

  console.log(`Reverse DNS:`);
  for (const ip of targetIps) {
    const name = await reverseDns(ip);
    console.log(`  ${ip} -> ${name ?? "(no PTR record)"}`);
  }

  const { y, m, d } = targetDate();
  const prefix = `alb-logs/AWSLogs/${ACCOUNT_ID}/elasticloadbalancing/${REGION}/${y}/${m}/${d}/`;
  console.log(`\nScanning ALB logs: ${prefix}`);
  const keys = await listLogKeys(prefix);
  if (keys.length === 0) {
    console.log(`  no log files found for ${y}-${m}-${d}`);
    return;
  }
  console.log(`  ${keys.length} log files`);

  const targetSet = new Set(targetIps);
  const perIp = new Map<string, IpStats>();
  for (const ip of targetIps) perIp.set(ip, { methods: new Map(), paths: new Map(), statuses: new Map(), total: 0 });

  async function processKey(key: string): Promise<void> {
    const res = await s3.send(new GetObjectCommand({ Bucket: LOG_BUCKET, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    const text = gunzipSync(Buffer.from(bytes)).toString("utf-8");
    for (const line of text.split("\n")) {
      if (!line) continue;
      const fields = line.split(" ");
      const ip = fields[3]?.split(":")[0];
      if (!ip || !targetSet.has(ip)) continue;
      const statusCode = fields[8];
      const reqMatch = line.match(/"(\S+) (\S+) \S+"/);
      const method = reqMatch?.[1] ?? "?";
      let path = reqMatch?.[2] ?? "?";
      try { path = new URL(path).pathname; } catch { /* keep as-is */ }

      const entry = perIp.get(ip)!;
      entry.total++;
      entry.methods.set(method, (entry.methods.get(method) ?? 0) + 1);
      entry.paths.set(path, (entry.paths.get(path) ?? 0) + 1);
      entry.statuses.set(statusCode, (entry.statuses.get(statusCode) ?? 0) + 1);
    }
  }

  const CONCURRENCY = 30;
  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    await Promise.all(keys.slice(i, i + CONCURRENCY).map(processKey));
  }

  for (const [ip, entry] of perIp) {
    console.log(`\n=== ${ip} (${entry.total} req) ===`);
    console.log(`  Methods:`, [...entry.methods.entries()].sort((a, b) => b[1] - a[1]));
    console.log(`  Status codes:`, [...entry.statuses.entries()].sort((a, b) => b[1] - a[1]));
    console.log(`  Top 8 paths:`);
    for (const [path, count] of [...entry.paths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`    ${count}  ${path}`);
    }
    console.log(`  Distinct paths hit: ${entry.paths.size}`);
  }
})();
