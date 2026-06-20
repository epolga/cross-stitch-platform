import "dotenv/config";
import { getPinterestAccessToken } from "./pinterestTokenManager";

const PINTEREST_API_BASE = "https://api.pinterest.com/v5";
const MAX_RETRIES = 6;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pinterestGet<T>(path: string): Promise<T> {
  const token = getPinterestAccessToken();

  let lastBody = "";
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(`${PINTEREST_API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      return response.json() as Promise<T>;
    }

    lastBody = await response.text();

    if (response.status === 429 && attempt < MAX_RETRIES - 1) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
      const backoffMs =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? retryAfterSec * 1000
          : Math.min(1000 * 2 ** attempt, 30_000);
      console.warn(
        `Pinterest 429, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
      );
      await sleep(backoffMs);
      continue;
    }

    throw new Error(`Pinterest API error ${response.status}: ${lastBody}`);
  }

  throw new Error(`Pinterest API exceeded ${MAX_RETRIES} retries on 429: ${lastBody}`);
}
