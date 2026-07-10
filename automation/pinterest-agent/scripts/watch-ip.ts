// CLI: npm run watch-ip -- <ip> "<reason>" [ttlDays=3]
// Writes a WATCHED_IP row to DDB. Does not block anything — it's a
// probation marker. When the TTL expires, a human reviews the IP's activity
// over the watch period and decides block/ignore via `npm run block-ip`.

import "dotenv/config";
import { putWatchedIp } from "../src/services/historyStore";

(async () => {
  const [ip, reason, ttlDaysArg] = process.argv.slice(2);
  if (!ip || !reason) {
    console.error('Usage: npm run watch-ip -- <ip> "<reason>" [ttlDays=3]');
    process.exit(1);
  }
  const ttlDays = ttlDaysArg ? Number(ttlDaysArg) : 3;

  await putWatchedIp({ ip, reason, ttlDays });
  console.log(`Watching ${ip} for ${ttlDays} day(s): ${reason}`);
  console.log("This does not block traffic — review again after the watch period via `npm run block-ip` if warranted.");
})().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
