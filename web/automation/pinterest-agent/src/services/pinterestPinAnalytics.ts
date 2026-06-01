import { pinterestGet } from "./pinterestClient";

export interface PinMetrics {
  impressions: number;
  clicks: number;
  outboundClicks: number;
  ctr: number;
  saves: number;
}

interface SummaryMetrics {
  IMPRESSION?: number;
  PIN_CLICK?: number;
  OUTBOUND_CLICK?: number;
  SAVE?: number;
}

interface AnalyticsResponse {
  all?: { summary_metrics?: SummaryMetrics };
}

const METRIC_TYPES = "IMPRESSION,PIN_CLICK,OUTBOUND_CLICK,SAVE";

export async function getPinAnalytics(
  pinId: string,
  startDate: string,
  endDate: string
): Promise<PinMetrics> {
  const path = `/pins/${encodeURIComponent(pinId)}/analytics?start_date=${startDate}&end_date=${endDate}&metric_types=${METRIC_TYPES}`;
  const res = await pinterestGet<AnalyticsResponse>(path);
  const s = res.all?.summary_metrics ?? {};
  const impressions = s.IMPRESSION ?? 0;
  const clicks = s.PIN_CLICK ?? 0;
  const ctr = impressions > 0 ? Math.round((clicks / impressions) * 100000) / 100000 : 0;
  return {
    impressions,
    clicks,
    outboundClicks: s.OUTBOUND_CLICK ?? 0,
    ctr,
    saves: s.SAVE ?? 0,
  };
}
