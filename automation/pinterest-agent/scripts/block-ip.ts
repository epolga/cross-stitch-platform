// CLI: npm run block-ip -- <ip> "<reason>" [ttlDays=30]
// Writes a BLOCKED_IP row to DDB. The next pipeline run syncs it into the
// WAF "AutoBlockedIPs" IP set; it auto-unblocks when the TTL expires.

import "dotenv/config";
import { putBlockedIp } from "../src/services/historyStore";

(async () => {
  const [ip, reason, ttlDaysArg] = process.argv.slice(2);
  if (!ip || !reason) {
    console.error('Usage: npm run block-ip -- <ip> "<reason>" [ttlDays=30]');
    process.exit(1);
  }
  const ttlDays = ttlDaysArg ? Number(ttlDaysArg) : 30;

  await putBlockedIp({ ip, reason, ttlDays });
  console.log(`Blocked ${ip} for ${ttlDays} day(s): ${reason}`);
  console.log("Takes effect on the next pipeline run's WAF sync step.");
})().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
