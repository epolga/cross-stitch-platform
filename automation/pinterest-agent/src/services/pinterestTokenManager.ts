import { getPinterestToken, putPinterestToken } from "./historyStore";
import { sendTelegramMessage } from "./telegramClient";

const REFRESH_THRESHOLD_DAYS = 7;

let cachedToken: string | null = null;

function daysUntilExpiry(expiresAtUtc: string): number {
  return (new Date(expiresAtUtc).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
}

async function callRefreshEndpoint(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}> {
  const clientId = process.env.PINTEREST_CLIENT_ID;
  const clientSecret = process.env.PINTEREST_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PINTEREST_CLIENT_ID and PINTEREST_CLIENT_SECRET env vars required for token refresh");
  }
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://api.pinterest.com/v5/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  });
  if (!res.ok) {
    throw new Error(`Pinterest token refresh HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number; scope: string }>;
}

// Called once at Lambda startup (in handler.ts). Reads the token from DDB,
// refreshes it if it expires within REFRESH_THRESHOLD_DAYS, and caches the
// result for the rest of the pipeline run.
export async function initPinterestToken(): Promise<void> {
  const record = await getPinterestToken();

  if (!record) {
    // DDB not yet seeded — fall back to env var. Run scripts/seed-pinterest-token.ts once to fix.
    const envToken = process.env.PINTEREST_ACCESS_TOKEN;
    if (!envToken) throw new Error("No Pinterest token in DDB or PINTEREST_ACCESS_TOKEN env var");
    console.log("  Pinterest token loaded from env var (DDB not seeded — run npm run seed-pinterest-token)");
    cachedToken = envToken;
    return;
  }

  const days = daysUntilExpiry(record.expires_at_utc);

  if (days > REFRESH_THRESHOLD_DAYS) {
    console.log(`  Pinterest token valid, expires in ${days.toFixed(1)} days`);
    cachedToken = record.access_token;
    return;
  }

  console.log(`  Pinterest token expires in ${days.toFixed(1)} days — auto-refreshing`);
  const newTokenData = await callRefreshEndpoint(record.refresh_token);
  const expiresAtUtc = new Date(Date.now() + newTokenData.expires_in * 1000).toISOString();

  await putPinterestToken({
    access_token: newTokenData.access_token,
    refresh_token: newTokenData.refresh_token,
    expires_at_utc: expiresAtUtc,
    scope: newTokenData.scope,
    refreshedAt: new Date().toISOString(),
  });

  cachedToken = newTokenData.access_token;

  console.log(`  Pinterest token refreshed, new expiry: ${expiresAtUtc}`);
  await sendTelegramMessage(
    `🔄 <b>Pinterest token auto-refreshed</b>\nNew expiry: ${expiresAtUtc.slice(0, 10)}`
  );
}

// Returns the access token initialized by initPinterestToken().
// Falls back to PINTEREST_ACCESS_TOKEN env var so local scripts that skip
// initPinterestToken() continue to work unchanged.
export function getPinterestAccessToken(): string {
  if (cachedToken) return cachedToken;
  const envToken = process.env.PINTEREST_ACCESS_TOKEN;
  if (envToken) return envToken;
  throw new Error("Pinterest token not available — call initPinterestToken() or set PINTEREST_ACCESS_TOKEN");
}
