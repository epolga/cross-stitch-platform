// Syncs the WAF IP set "AutoBlockedIPs" to match the current BLOCKED_IP rows
// in DynamoDB. DDB's native TTL is the source of truth for expiry: once a row's
// ttl passes, it drops out of the query below and the next sync removes the IP
// from WAF — no separate "unblock" step needed.
//
// The IP set itself lives outside this table (WAF is not DDB-backed), so this
// module is the bridge: DDB says what *should* be blocked, WAF enforces it.

import {
  WAFV2Client,
  GetIPSetCommand,
  UpdateIPSetCommand,
} from "@aws-sdk/client-wafv2";
import { queryRange, type BlockedIpRecord } from "./historyStore";

const REGION = process.env.AWS_REGION || "us-east-1";
const IP_SET_NAME = process.env.WAF_AUTO_BLOCK_IP_SET_NAME || "AutoBlockedIPs";
const IP_SET_ID = process.env.WAF_AUTO_BLOCK_IP_SET_ID;

const waf = new WAFV2Client({ region: REGION });

export interface WafIpSyncResult {
  synced: boolean;
  reason?: string;
  activeIpCount?: number;
  addresses?: string[];
}

export async function syncBlockedIpsToWaf(): Promise<WafIpSyncResult> {
  if (!IP_SET_ID) {
    return { synced: false, reason: "WAF_AUTO_BLOCK_IP_SET_ID not configured" };
  }

  const rows = await queryRange<BlockedIpRecord>("BLOCKED_IP");
  const now = Math.floor(Date.now() / 1000);
  // Defensive filter: DDB purges expired rows within ~48h of TTL passing, not
  // instantly, so a just-expired row can still show up in the query for a
  // while. Filtering here means expiry takes effect on the very next sync.
  const active = rows.filter((r) => r.ttl > now);
  const addresses = active.map((r) => `${r.ip}/32`);

  const current = await waf.send(
    new GetIPSetCommand({ Name: IP_SET_NAME, Scope: "REGIONAL", Id: IP_SET_ID })
  );
  const lockToken = current.LockToken;
  if (!lockToken) {
    return { synced: false, reason: "GetIPSet returned no LockToken" };
  }

  await waf.send(
    new UpdateIPSetCommand({
      Name: IP_SET_NAME,
      Scope: "REGIONAL",
      Id: IP_SET_ID,
      Addresses: addresses,
      LockToken: lockToken,
    })
  );

  return { synced: true, activeIpCount: active.length, addresses };
}
