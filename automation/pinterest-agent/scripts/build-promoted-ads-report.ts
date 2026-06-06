import "dotenv/config";
import { pinterestGet } from "../src/services/pinterestClient";
import { batchPutPromotedAdStats, type PromotedAdStatsInput } from "../src/services/historyStore";
import { formatDate, yesterdayDate } from "../src/services/dateUtils";

const AD_ACCOUNT = process.env.PINTEREST_AD_ACCOUNT_ID!;

interface AdItem {
  id: string;
  name: string;
  status: string;
  destination_url?: string;
  pin_id?: string;
}

interface AdAnalyticsRow {
  AD_ID: string;
  SPEND_IN_MICRO_DOLLAR: string;
  IMPRESSION_1: string;
  CLICKTHROUGH_1: string;
  OUTBOUND_CLICK_1: string;
  CTR: string;
}

async function getNonArchivedAds(): Promise<AdItem[]> {
  const resp = await pinterestGet<{ items: AdItem[] }>(
    `/ad_accounts/${AD_ACCOUNT}/ads?page_size=50&entity_statuses=ACTIVE,PAUSED,ARCHIVED`
  );
  return (resp.items ?? []).filter((a) => a.status !== "ARCHIVED");
}

async function getAdAnalytics(adIds: string[], dateStr: string): Promise<AdAnalyticsRow[]> {
  const columns = "SPEND_IN_MICRO_DOLLAR,IMPRESSION_1,CLICKTHROUGH_1,OUTBOUND_CLICK_1,CTR,AD_ID";
  // Pinterest v5 silently ignores all but the first ad_ids param when batched,
  // so fetch one ad at a time and merge results.
  const results: AdAnalyticsRow[] = [];
  for (const id of adIds) {
    const rows = await pinterestGet<AdAnalyticsRow[]>(
      `/ad_accounts/${AD_ACCOUNT}/ads/analytics?start_date=${dateStr}&end_date=${dateStr}&columns=${columns}&granularity=DAY&ad_ids=${encodeURIComponent(id)}`
    );
    results.push(...rows);
  }
  return results;
}

export async function run(dateStr?: string): Promise<void> {
  const date = dateStr ?? formatDate(yesterdayDate());

  const ads = await getNonArchivedAds();
  if (ads.length === 0) {
    console.log("  no ads found");
    return;
  }

  const adMap = new Map(ads.map((a) => [a.id, a]));
  const rows = await getAdAnalytics(ads.map((a) => a.id), date);

  const inputs: PromotedAdStatsInput[] = rows.map((row) => {
    const ad = adMap.get(row.AD_ID);
    const destUrl = ad?.destination_url ?? "";
    return {
      date,
      adId: row.AD_ID,
      destinationUrl: destUrl,
      title: ad?.name ?? row.AD_ID,
      spend: parseInt(row.SPEND_IN_MICRO_DOLLAR || "0", 10) / 1_000_000,
      impressions: parseInt(row.IMPRESSION_1 || "0", 10),
      clicks: parseInt(row.CLICKTHROUGH_1 || "0", 10),
      outboundClicks: parseInt(row.OUTBOUND_CLICK_1 || "0", 10),
      ctr: parseFloat(row.CTR || "0"),
    };
  });

  // Pinterest analytics omits ads with zero activity. Pad zero-rows so every
  // non-archived ad appears in PROMOTED_AD_STATS (and thus PIN_ATTRIBUTION) daily.
  const analyticsAdIds = new Set(inputs.map((i) => i.adId));
  for (const [id, ad] of adMap) {
    if (!analyticsAdIds.has(id)) {
      inputs.push({
        date,
        adId: id,
        destinationUrl: ad.destination_url ?? "",
        title: ad.name ?? id,
        spend: 0,
        impressions: 0,
        clicks: 0,
        outboundClicks: 0,
        ctr: 0,
      });
    }
  }

  await batchPutPromotedAdStats(inputs);

  const totalSpend = inputs.reduce((s, r) => s + r.spend, 0);
  const totalClicks = inputs.reduce((s, r) => s + r.clicks, 0);
  console.log(`  ${inputs.length} ads — total spend ₪${totalSpend.toFixed(2)}, ${totalClicks} clicks`);
  for (const r of inputs.sort((a, b) => b.clicks - a.clicks)) {
    const page = r.destinationUrl.replace(/^https?:\/\/[^/]+/, "");
    console.log(`    ${r.clicks}c / ${r.outboundClicks}oc  ₪${r.spend.toFixed(2)}  ${page}`);
  }
}

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) run().catch(console.error);
