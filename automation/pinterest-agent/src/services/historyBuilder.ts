import { round } from "./dateUtils";
import { queryRange } from "./historyStore";
import type { BusinessReport, DayMetrics, TrendWindow, TrendDirection, BusinessHistory } from "./types";

interface DailyRow {
  SortKey: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  outboundClicks: number;
  ga4Sessions: number;
  ga4PaidSessions: number;
  ga4OrganicSessions: number;
  ga4ReferralSessions: number;
  adsenseRevenue: number;
  revenuePerHundredSessions?: number;
  profit: number;
}

export async function loadReports(): Promise<BusinessReport[]> {
  const rows = await queryRange<DailyRow>("DAILY_BUSINESS");
  return rows.map((row) => ({
    date: row.SortKey,
    pinterestAds: {
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: row.ctr,
      cpc: row.cpc,
      outboundClicks: row.outboundClicks,
    },
    ga4PinterestSessions: {
      paidSocial: row.ga4PaidSessions,
      organic: row.ga4OrganicSessions,
      referral: row.ga4ReferralSessions,
      total: row.ga4Sessions,
    },
    adsense: { estimatedEarnings: row.adsenseRevenue },
    derived: {
      revenuePerHundredPinterestSessions: row.revenuePerHundredSessions ?? null,
      roughProfitEstimate: row.profit,
    },
  }));
}

export function toDay(r: BusinessReport): DayMetrics {
  return {
    date: r.date,
    spend: round(r.pinterestAds.spend),
    impressions: r.pinterestAds.impressions,
    clicks: r.pinterestAds.clicks,
    ctr: r.pinterestAds.ctr,
    cpc: round(r.pinterestAds.cpc),
    outboundClicks: r.pinterestAds.outboundClicks,
    ga4Sessions: r.ga4PinterestSessions.total,
    ga4PaidSessions: r.ga4PinterestSessions.paidSocial,
    ga4OrganicSessions: r.ga4PinterestSessions.organic,
    adsenseRevenue: r.adsense.estimatedEarnings,
    revenuePerHundredSessions: r.derived.revenuePerHundredPinterestSessions,
    profit: round(r.derived.roughProfitEstimate),
  };
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export function computeWindow(days: DayMetrics[]): TrendWindow {
  const revPer100 = days
    .map((d) => d.revenuePerHundredSessions)
    .filter((v): v is number => v !== null);

  return {
    days: days.length,
    avgSpend: avg(days.map((d) => d.spend)),
    avgClicks: avg(days.map((d) => d.clicks)),
    avgOutboundClicks: avg(days.map((d) => d.outboundClicks)),
    avgSessions: avg(days.map((d) => d.ga4Sessions)),
    avgRevenue: avg(days.map((d) => d.adsenseRevenue)),
    avgProfit: avg(days.map((d) => d.profit)),
    avgCtr: avg(days.map((d) => d.ctr)),
    avgCpc: avg(days.map((d) => d.cpc)),
    avgRevenuePerHundredSessions: revPer100.length > 0 ? avg(revPer100) : null,
  };
}

export function computeDirections(days: DayMetrics[]): TrendDirection[] {
  if (days.length < 2) return [];

  const metrics: { key: keyof DayMetrics; label: string }[] = [
    { key: "spend", label: "spend" },
    { key: "clicks", label: "clicks" },
    { key: "ga4Sessions", label: "sessions" },
    { key: "adsenseRevenue", label: "revenue" },
    { key: "profit", label: "profit" },
    { key: "ctr", label: "ctr" },
  ];

  const directions: TrendDirection[] = [];

  for (const { key, label } of metrics) {
    const values = days.map((d) => d[key] as number);
    const first = values[0];
    const last = values[values.length - 1];

    if (first === 0 && last === 0) {
      directions.push({ metric: label, direction: "stable", changePercent: 0 });
      continue;
    }

    const base = first || 0.01;
    const changePct = round(((last - first) / Math.abs(base)) * 100);

    let direction: TrendDirection["direction"];
    if (Math.abs(changePct) < 5) direction = "stable";
    else if (changePct > 0) direction = "increasing";
    else direction = "decreasing";

    directions.push({ metric: label, direction, changePercent: changePct });
  }

  return directions;
}

export async function buildHistory(): Promise<BusinessHistory> {
  const reports = await loadReports();

  if (reports.length === 0) {
    throw new Error("No DAILY_BUSINESS rows found in DDB");
  }

  const dailyMetrics = reports.map(toDay);
  const sorted = [...dailyMetrics].sort((a, b) => a.date.localeCompare(b.date));

  const threeDay = sorted.length >= 3
    ? computeWindow(sorted.slice(-3))
    : sorted.length >= 2
      ? computeWindow(sorted.slice(-sorted.length))
      : null;

  const sevenDay = sorted.length >= 7
    ? computeWindow(sorted.slice(-7))
    : null;

  const directions = computeDirections(sorted);

  return {
    generatedAt: new Date().toISOString(),
    totalDays: sorted.length,
    dateRange: { first: sorted[0].date, last: sorted[sorted.length - 1].date },
    dailyMetrics: sorted,
    trends: { threeDay, sevenDay },
    directions,
  };
}
