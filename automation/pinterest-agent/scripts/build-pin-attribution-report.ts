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
}

interface DailyBusinessRow {
  adsenseRevenue: number;
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

  const totalRevenue = bizRows[0].adsenseRevenue;

  const pageSessionMap = new Map<string, number>();
  let totalPaidSessions = 0;
  for (const r of pageRows) {
    pageSessionMap.set(r.page, r.paidSessions);
    totalPaidSessions += r.paidSessions;
  }

  const inputs: PinAttributionInput[] = adRows.map((ad) => {
    let page = ad.destinationUrl;
    try { page = new URL(ad.destinationUrl).pathname; } catch {}

    const paidSessions = pageSessionMap.get(page) ?? 0;
    const attributedRevenue =
      totalPaidSessions > 0
        ? (paidSessions / totalPaidSessions) * totalRevenue
        : 0;

    return {
      date,
      adId: ad.adId,
      title: ad.title,
      destinationUrl: ad.destinationUrl,
      clicks: ad.clicks,
      outboundClicks: ad.outboundClicks,
      spend: ad.spend,
      paidSessions,
      attributedRevenue,
      profit: attributedRevenue - ad.spend,
    };
  });

  await batchPutPinAttribution(inputs);

  console.log(
    `  ${inputs.length} pins — total revenue $${totalRevenue.toFixed(2)}, paid sessions: ${totalPaidSessions}`
  );
  for (const r of [...inputs].sort((a, b) => b.profit - a.profit)) {
    const page = r.destinationUrl.replace(/^https?:\/\/[^/]+/, "");
    const sign = r.profit >= 0 ? "+" : "";
    console.log(
      `    ${r.clicks}c  $${r.spend.toFixed(2)}sp  ~$${r.attributedRevenue.toFixed(2)}rev  ~${sign}$${r.profit.toFixed(2)}profit  ${page}`
    );
  }
}

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) run().catch(console.error);
