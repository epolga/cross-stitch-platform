// Shared types for daily business reports and history aggregation

export interface PinterestAdMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  outboundClicks: number;
}

export interface GA4PinterestSessions {
  paidSocial: number;
  organic: number;
  referral: number;
  total: number;
}

export interface BusinessReport {
  date: string;
  pinterestAds: PinterestAdMetrics;
  ga4PinterestSessions: GA4PinterestSessions;
  adsense: { estimatedEarnings: number };
  derived: {
    revenuePerHundredPinterestSessions: number | null;
    roughProfitEstimate: number;
  };
}

export interface DayMetrics {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  outboundClicks: number;
  ga4Sessions: number;
  ga4PaidSessions: number;
  ga4OrganicSessions: number;
  adsenseRevenue: number;
  revenuePerHundredSessions: number | null;
  profit: number;
}

export interface TrendWindow {
  days: number;
  avgSpend: number;
  avgClicks: number;
  avgOutboundClicks: number;
  avgSessions: number;
  avgRevenue: number;
  avgProfit: number;
  avgCtr: number;
  avgCpc: number;
  avgRevenuePerHundredSessions: number | null;
}

export interface TrendDirection {
  metric: string;
  direction: "increasing" | "decreasing" | "stable";
  changePercent: number;
}

export interface BusinessHistory {
  generatedAt: string;
  totalDays: number;
  dateRange: { first: string; last: string };
  dailyMetrics: DayMetrics[];
  trends: {
    threeDay: TrendWindow | null;
    sevenDay: TrendWindow | null;
  };
  directions: TrendDirection[];
}
