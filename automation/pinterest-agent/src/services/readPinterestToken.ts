import * as fs from "node:fs";
import { resolvePinterestTokenPath } from "./readPlatformConfig";

interface PinterestTokenFile {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expires_at_utc?: string;
}

export function readPinterestAccessToken(): string {
  if (process.env.PINTEREST_ACCESS_TOKEN) {
    return process.env.PINTEREST_ACCESS_TOKEN;
  }

  const tokenPath = resolvePinterestTokenPath();
  if (!fs.existsSync(tokenPath)) {
    throw new Error(`Pinterest token file not found at ${tokenPath}`);
  }

  const raw = fs.readFileSync(tokenPath, "utf8");
  let token: PinterestTokenFile;
  try {
    token = JSON.parse(raw) as PinterestTokenFile;
  } catch (err) {
    throw new Error(
      `Failed to parse Pinterest token file at ${tokenPath}: ${(err as Error).message}`
    );
  }

  if (!token.access_token) {
    throw new Error(`Pinterest token file at ${tokenPath} has no access_token`);
  }
  return token.access_token;
}
