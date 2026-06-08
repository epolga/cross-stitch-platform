import "dotenv/config";
import {
  queryRange,
  batchPutPinAttribution,
  type PinAttributionInput,
} from "../src/services/historyStore";
import { formatDate, yesterdayDate } from "../src/services/dateUtils";

interface PromotedAdRow {
  adId: string;
  title: string;
  destinationUrl: string;
  clicks: number;
  outboundClicks: number;
  spend: number;
}

interface LandingPageRow {
  page: string;
  paidSessions: number;
  organicSessions: number;
  referralSessions: number;
}

interface DailyBusinessRow {
  adsenseRevenue: number;
  ga4Sessions: number;
  usdIlsRate?: number;
}

export async function run(dateStr?: string): Promise<void> {
  const date = dateStr ?? formatDate(yesterdayDate());

  const [adRows, pageRows, bizRows] = await Promise.all([
    queryRange<PromotedAdRow>("PROMOTED_AD_STATS", {
      startKey: `${date}#`,
      endKey: `${date}#~`,
    }),
    queryRange<LandingPageRow>("LANDING_PAGE_STATS", {
      startKey: `${date}#`,
      endKey: `${date}#~`,
    }),
    queryRange<DailyBusinessRow>("DAILY_BUSINESS", {
      startKey: date,
      endKey: date,
    }),
  ]);

  if (adRows.length === 0) {
    console.log(`  no PROMOTED_AD_STATS for ${date}`);
    return;
  }
  if (!bizRows[0]) {
    console.log(`  no DAILY_BUSINESS row for ${date}`);
    return;
  }

  const totalRevenue = bizRows[0].adsenseRevenue;   // ILS
  const totalAllSessions = bizRows[0].ga4Sessions;
  const usdIlsRate = bizRows[0].usdIlsRate ?? 3.65; // fallback for old rows without rate

  // Total sessions per page across all sources (paid + organic + referral)
  // Promotion lifts total traffic, not just paid clicks, so we measure full impact.
  const pageSessionMap = new Map<string, number>();
  let totalTrackedSessions = 0;
  for (const r of pageRows) {
    const all = r.paidSessions + r.organicSessions + r.referralSessions;
    pageSessionMap.set(r.page, all);
    totalTrackedSessions += all;
  }

  const inputs: PinAttributionInput[] = adRows.map((ad) => {
    let page = ad.destinationUrl;
    try { page = new URL(ad.destinationUrl).pathname; } catch {}

    const pageSessions = pageSessionMap.get(page) ?? 0;
    const attributedRevenue =
      totalAllSessions > 0
        ? (pageSessions / totalAllSessions) * totalRevenue
        : 0;
    const spendIls = ad.spend * usdIlsRate; // convert USD → ILS

    return {
      date,
      adId: ad.adId,
      title: ad.title,
      destinationUrl: ad.destinationUrl,
      clicks: ad.clicks,
      outboundClicks: ad.outboundClicks,
      spend: ad.spend,
      paidSessions: pageSessions, // stored as total sessions (all sources)
      attributedRevenue,
      profit: attributedRevenue - spendIls, // both ILS
    };
  });

  await batchPutPinAttribution(inputs);

  console.log(
    `  ${inputs.length} pins — total revenue ₪${totalRevenue.toFixed(2)}, all sessions: ${totalAllSessions}, tracked page sessions: ${totalTrackedSessions}`
  );
  for (const r of [...inputs].sort((a, b) => b.profit - a.profit)) {
    const page = r.destinationUrl.replace(/^https?:\/\/[^/]+/, "");
    const sign = r.profit >= 0 ? "+" : "";
    console.log(
      `    ${r.clicks}c  $${r.spend.toFixed(2)}sp  ~₪${r.attributedRevenue.toFixed(2)}rev  ~${sign}₪${r.profit.toFixed(2)}profit  ${page}`
    );
  }
}

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) run(process.argv[2]).catch(console.error);
