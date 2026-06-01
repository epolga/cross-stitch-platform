import { pinterestGet } from "./pinterestClient";
import type { PinterestAdMetrics } from "./types";

interface AdAnalyticsRow {
  SPEND_IN_MICRO_DOLLAR: string;
  IMPRESSION_1: string;
  CLICKTHROUGH_1: string;
  CTR: string;
  ECPC_IN_MICRO_DOLLAR: string;
  OUTBOUND_CLICK_1: string;
}

export async function getPinterestAdMetrics(adAccountId: string, dateStr: string): Promise<PinterestAdMetrics> {
  const columns = [
    "SPEND_IN_MICRO_DOLLAR",
    "IMPRESSION_1",
    "CLICKTHROUGH_1",
    "CTR",
    "ECPC_IN_MICRO_DOLLAR",
    "OUTBOUND_CLICK_1",
  ].join(",");

  const rows = await pinterestGet<AdAnalyticsRow[]>(
    `/ad_accounts/${encodeURIComponent(adAccountId)}/analytics?start_date=${dateStr}&end_date=${dateStr}&columns=${columns}&granularity=DAY`
  );

  if (!rows.length) {
    return { spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, outboundClicks: 0 };
  }

  const row = rows[0];
  return {
    spend: parseInt(row.SPEND_IN_MICRO_DOLLAR || "0", 10) / 1_000_000,
    impressions: parseInt(row.IMPRESSION_1 || "0", 10),
    clicks: parseInt(row.CLICKTHROUGH_1 || "0", 10),
    ctr: parseFloat(row.CTR || "0"),
    cpc: parseInt(row.ECPC_IN_MICRO_DOLLAR || "0", 10) / 1_000_000,
    outboundClicks: parseInt(row.OUTBOUND_CLICK_1 || "0", 10),
  };
}
