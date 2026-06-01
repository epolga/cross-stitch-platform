import "dotenv/config";
import { yesterdayDateStr } from "../src/services/dateUtils";
import { getPinterestAdMetrics } from "../src/services/pinterestAds";

const PINTEREST_AD_ACCOUNT_ID = process.env.PINTEREST_AD_ACCOUNT_ID;
if (!PINTEREST_AD_ACCOUNT_ID) {
  console.error("Missing PINTEREST_AD_ACCOUNT_ID in .env");
  process.exit(1);
}

async function main() {
  const date = yesterdayDateStr();
  const metrics = await getPinterestAdMetrics(PINTEREST_AD_ACCOUNT_ID!, date);

  if (metrics.impressions === 0) {
    console.log(`No ad data for ${date}`);
    return;
  }

  console.log(`\n=== Pinterest Ad Report (${date}) ===\n`);
  console.log(`  Spend:           $${metrics.spend.toFixed(2)}`);
  console.log(`  Impressions:     ${metrics.impressions}`);
  console.log(`  Clicks:          ${metrics.clicks}`);
  console.log(`  CTR:             ${(metrics.ctr * 100).toFixed(2)}%`);
  console.log(`  CPC:             $${metrics.cpc.toFixed(2)}`);
  console.log(`  Outbound clicks: ${metrics.outboundClicks}`);
  console.log();
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
