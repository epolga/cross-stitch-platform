// One-time script to seed the Pinterest token from pinterest_tokens.json into DynamoDB.
// After this runs, the Lambda will auto-refresh the token before it expires — no manual
// action needed. Run this whenever you manually refresh the token outside of DDB.
//
// Usage: npm run seed-pinterest-token

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { putPinterestToken } from "../src/services/historyStore";

interface TokenFile {
  access_token: string;
  refresh_token: string;
  expires_at_utc: string;
  scope: string;
}

async function main(): Promise<void> {
  const tokenPath = path.resolve(__dirname, "../pinterest_tokens.json");
  if (!fs.existsSync(tokenPath)) {
    throw new Error(`pinterest_tokens.json not found at ${tokenPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(tokenPath, "utf8")) as TokenFile;
  if (!raw.access_token || !raw.refresh_token || !raw.expires_at_utc) {
    throw new Error("pinterest_tokens.json is missing required fields");
  }

  await putPinterestToken({
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    expires_at_utc: raw.expires_at_utc,
    scope: raw.scope,
  });

  console.log("Pinterest token seeded to DDB.");
  console.log(`  access_token: ${raw.access_token.slice(0, 25)}...`);
  console.log(`  expires_at_utc: ${raw.expires_at_utc}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
