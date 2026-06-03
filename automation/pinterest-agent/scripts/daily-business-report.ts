import "dotenv/config";
import { formatDate, yesterdayDate } from "../src/services/dateUtils";
import { getPinterestAdMetrics } from "../src/services/pinterestAds";
import { getGA4PinterestSessions, getAdSenseEarnings } from "../src/services/googleAnalytics";
import { putDailyBusiness } from "../src/services/historyStore";
import type { BusinessReport } from "../src/services/types";

const PINTEREST_AD_ACCOUNT_ID = process.env.PINTEREST_AD_ACCOUNT_ID;

export async function run(dateStr?: string): Promise<BusinessReport> {
  const adAccountId = PINTEREST_AD_ACCOUNT_ID;
  if (!adAccountId) throw new Error("Missing PINTEREST_AD_ACCOUNT_ID in env");

  const date = dateStr ?? formatDate(yesterdayDate());

  const [pinterestAds, ga4Sessions, adsenseEarnings] = await Promise.all([
    getPinterestAdMetrics(adAccountId, date),
    getGA4PinterestSessions(),
    getAdSenseEarnings(),
  ]);

  const revPer100 =
    ga4Sessions.total > 0
      ? Math.round(((adsenseEarnings / ga4Sessions.total) * 100) * 100) / 100
      : null;

  const roughProfit = Math.round((adsenseEarnings - pinterestAds.spend) * 100) / 100;

  const report: BusinessReport = {
    date,
    pinterestAds,
    ga4PinterestSessions: ga4Sessions,
    adsense: { estimatedEarnings: adsenseEarnings },
    derived: {
      revenuePerHundredPinterestSessions: revPer100,
      roughProfitEstimate: roughProfit,
    },
  };

  console.log(`\n=== Daily Business Report (${date}) ===\n`);
  console.log(`  Pinterest spend:              $${pinterestAds.spend.toFixed(2)}`);
  console.log(`  Pinterest clicks:             ${pinterestAds.clicks}`);
  console.log(`  Pinterest outbound clicks:    ${pinterestAds.outboundClicks}`);
  console.log(`  GA4 Pinterest sessions:       ${ga4Sessions.total} (paid: ${ga4Sessions.paidSocial}, organic: ${ga4Sessions.organic}, referral: ${ga4Sessions.referral})`);
  console.log(`  AdSense estimated earnings:   $${adsenseEarnings.toFixed(2)}`);
  console.log(`  Est. revenue / 100 sessions:  ${revPer100 !== null ? `$${revPer100.toFixed(2)}` : "N/A"}`);
  console.log(`  Rough profit estimate:        $${roughProfit.toFixed(2)}`);
  console.log();

  await putDailyBusiness({
    date,
    spend: pinterestAds.spend,
    impressions: pinterestAds.impressions,
    clicks: pinterestAds.clicks,
    ctr: pinterestAds.ctr,
    cpc: pinterestAds.cpc,
    outboundClicks: pinterestAds.outboundClicks,
    ga4Sessions: ga4Sessions.total,
    ga4PaidSessions: ga4Sessions.paidSocial,
    ga4OrganicSessions: ga4Sessions.organic,
    ga4ReferralSessions: ga4Sessions.referral,
    adsenseRevenue: adsenseEarnings,
    revenuePerHundredSessions: revPer100 ?? undefined,
    profit: roughProfit,
  });
  console.log(`  Saved → DDB CrossStitchBusinessHistory[DAILY_BUSINESS#${date}]\n`);

  return report;
}

async function main() {
  const argDate = process.argv.find((a) => a.startsWith("--date="))?.split("=")[1];
  await run(argDate);
}

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  main().catch((err) => {
    console.error("Error:", err.message || err);
    process.exit(1);
  });
}
