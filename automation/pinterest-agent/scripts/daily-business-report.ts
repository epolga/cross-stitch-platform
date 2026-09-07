import "dotenv/config";
import { formatDate, yesterdayDate, parseDate, recentDateStrings } from "../src/services/dateUtils";
import { getPinterestAdMetrics } from "../src/services/pinterestAds";
import { getGA4PinterestSessions, getGA4TotalSessions, getAdSenseEarnings } from "../src/services/googleAnalytics";
import {
  putDailyBusiness,
  queryRange,
  getDailyBusiness,
  updateDailyBusinessGa4Fields,
} from "../src/services/historyStore";
import { getUsdIlsRate } from "../src/services/currencyRate";
import type { BusinessReport } from "../src/services/types";

const PINTEREST_AD_ACCOUNT_ID = process.env.PINTEREST_AD_ACCOUNT_ID;

export async function run(dateStr?: string): Promise<BusinessReport> {
  const adAccountId = PINTEREST_AD_ACCOUNT_ID;
  if (!adAccountId) throw new Error("Missing PINTEREST_AD_ACCOUNT_ID in env");

  const date = dateStr ?? formatDate(yesterdayDate());

  // Last known rate from DDB — used as fallback if Bank of Israel API is down
  const recentRows = await queryRange<{ usdIlsRate?: number }>("DAILY_BUSINESS", {
    scanForward: false,
    limit: 10,
  });
  const lastKnownRate = recentRows.find((r) => r.usdIlsRate != null)?.usdIlsRate ?? 2.89;

  const [pinterestAds, ga4Sessions, ga4TotalAllSessions, adsenseEarnings, usdIlsRate] = await Promise.all([
    getPinterestAdMetrics(adAccountId, date),
    getGA4PinterestSessions(),
    getGA4TotalSessions(date),
    getAdSenseEarnings(),
    getUsdIlsRate(lastKnownRate),
  ]);

  const spendIls = Math.round(pinterestAds.spend * usdIlsRate * 100) / 100;

  const revPer100 =
    ga4Sessions.total > 0
      ? Math.round(((adsenseEarnings / ga4Sessions.total) * 100) * 100) / 100
      : null;

  const roughProfit = Math.round((adsenseEarnings - spendIls) * 100) / 100;

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
  console.log(`  Pinterest spend:              $${pinterestAds.spend.toFixed(2)} USD = ₪${spendIls.toFixed(2)} (rate: ${usdIlsRate.toFixed(4)})`);
  console.log(`  Pinterest clicks:             ${pinterestAds.clicks}`);
  console.log(`  Pinterest outbound clicks:    ${pinterestAds.outboundClicks}`);
  console.log(`  GA4 Pinterest sessions:       ${ga4Sessions.total} (paid: ${ga4Sessions.paidSocial}, organic: ${ga4Sessions.organic}, referral: ${ga4Sessions.referral})`);
  console.log(`  GA4 total site sessions:      ${ga4TotalAllSessions}`);
  console.log(`  AdSense estimated earnings:   ₪${adsenseEarnings.toFixed(2)}`);
  console.log(`  Est. revenue / 100 sessions:  ${revPer100 !== null ? `₪${revPer100.toFixed(2)}` : "N/A"}`);
  console.log(`  Rough profit estimate:        ₪${roughProfit.toFixed(2)} (revenue ₪ − spend ₪)`);
  console.log();

  await putDailyBusiness({
    date,
    usdIlsRate,
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
    ga4TotalAllSessions,
    adsenseRevenue: adsenseEarnings,
    revenuePerHundredSessions: revPer100 ?? undefined,
    profit: roughProfit,
  });
  console.log(`  Saved → DDB CrossStitchBusinessHistory[DAILY_BUSINESS#${date}]\n`);

  return report;
}

// GA4 session counts and AdSense earnings aren't always fully settled by the
// time run() first writes a day's row (~24h later) — confirmed some days
// still undercounted by up to 100% even 4-5 days out. Re-checks a rolling
// window of already-written rows and corrects just the GA4/AdSense-derived
// fields in place (via UpdateCommand, not a full overwrite) whenever the
// freshly-queried numbers differ from what's stored.
export async function backfillDailyBusiness(daysBack = 14): Promise<void> {
  const dates = recentDateStrings(daysBack, 2); // skip yesterday (too fresh) and today
  for (const date of dates) {
    const existing = await getDailyBusiness(date);
    if (!existing) {
      console.log(`  [backfill ${date}] no existing row — skipped`);
      continue;
    }

    const [ga4Sessions, ga4TotalAllSessions, adsenseRevenue] = await Promise.all([
      getGA4PinterestSessions(date),
      getGA4TotalSessions(date),
      getAdSenseEarnings(parseDate(date)),
    ]);

    const changed =
      existing.ga4TotalAllSessions !== ga4TotalAllSessions ||
      existing.ga4Sessions !== ga4Sessions.total ||
      existing.ga4PaidSessions !== ga4Sessions.paidSocial ||
      existing.ga4OrganicSessions !== ga4Sessions.organic ||
      existing.ga4ReferralSessions !== ga4Sessions.referral ||
      existing.adsenseRevenue !== adsenseRevenue;

    if (!changed) {
      console.log(`  [backfill ${date}] unchanged (already correct)`);
      continue;
    }

    const spendIls = Math.round(existing.spend * (existing.usdIlsRate ?? 1) * 100) / 100;
    const revPer100 =
      ga4Sessions.total > 0 ? Math.round(((adsenseRevenue / ga4Sessions.total) * 100) * 100) / 100 : null;
    const profit = Math.round((adsenseRevenue - spendIls) * 100) / 100;

    await updateDailyBusinessGa4Fields(date, {
      ga4TotalAllSessions,
      ga4Sessions: ga4Sessions.total,
      ga4PaidSessions: ga4Sessions.paidSocial,
      ga4OrganicSessions: ga4Sessions.organic,
      ga4ReferralSessions: ga4Sessions.referral,
      adsenseRevenue,
      revenuePerHundredSessions: revPer100 ?? undefined,
      profit,
    });
    console.log(
      `  [backfill ${date}] corrected: ga4TotalAllSessions ${existing.ga4TotalAllSessions ?? "?"} -> ${ga4TotalAllSessions}, ` +
        `adsenseRevenue ${existing.adsenseRevenue} -> ${adsenseRevenue}`
    );
  }
}

async function main() {
  const argDate = process.argv.find((a) => a.startsWith("--date="))?.split("=")[1];
  const backfillOnly = process.argv.includes("--backfill-only");
  const daysBackArg = process.argv.find((a) => a.startsWith("--backfill-days="))?.split("=")[1];
  const daysBack = daysBackArg ? parseInt(daysBackArg, 10) : undefined;

  if (!backfillOnly) await run(argDate);

  console.log(`\n=== Backfill: rechecking last ${daysBack ?? 14} day(s) of GA4/AdSense fields ===`);
  await backfillDailyBusiness(daysBack);
}

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  main().catch((err) => {
    console.error("Error:", err.message || err);
    process.exit(1);
  });
}
