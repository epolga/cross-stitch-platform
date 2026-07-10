import { analyticsData, adsense, GA4_PROPERTY_ID } from "./googleClient";
import { yesterdayDate } from "./dateUtils";
import type { GA4PinterestSessions } from "./types";
import type { LandingPageStatsInput } from "./historyStore";

export async function getGA4PinterestSessions(): Promise<GA4PinterestSessions> {
  const response = await analyticsData.properties.runReport({
    property: `properties/${GA4_PROPERTY_ID}`,
    requestBody: {
      dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
      dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: {
        filter: {
          fieldName: "sessionSource",
          stringFilter: {
            matchType: "CONTAINS",
            value: "pinterest",
            caseSensitive: false,
          },
        },
      },
    },
  });

  let paidSocial = 0;
  let organic = 0;
  let referral = 0;

  for (const row of response.data.rows || []) {
    const medium = (row.dimensionValues?.[1]?.value || "").toLowerCase();
    const sessions = parseInt(row.metricValues?.[0]?.value || "0", 10);

    if (medium === "paidsocial") paidSocial += sessions;
    else if (medium === "organic") organic += sessions;
    else if (medium === "referral") referral += sessions;
  }

  return { paidSocial, organic, referral, total: paidSocial + organic + referral };
}

export async function getGA4LandingPageStats(date: string): Promise<Omit<LandingPageStatsInput, "date">[]> {
  const response = await analyticsData.properties.runReport({
    property: `properties/${GA4_PROPERTY_ID}`,
    requestBody: {
      dateRanges: [{ startDate: date, endDate: date }],
      dimensions: [
        { name: "sessionSource" },
        { name: "sessionMedium" },
        { name: "landingPage" },
      ],
      metrics: [{ name: "sessions" }],
      dimensionFilter: {
        filter: {
          fieldName: "sessionSource",
          stringFilter: { matchType: "CONTAINS", value: "pinterest", caseSensitive: false },
        },
      },
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "50",
    },
  });

  // Aggregate per landing page across paid/organic/referral
  const pageMap = new Map<string, { paid: number; organic: number; referral: number }>();

  for (const row of response.data.rows ?? []) {
    const medium = (row.dimensionValues?.[1]?.value ?? "").toLowerCase();
    const page   = row.dimensionValues?.[2]?.value ?? "(unknown)";
    const n      = parseInt(row.metricValues?.[0]?.value ?? "0", 10);

    if (!pageMap.has(page)) pageMap.set(page, { paid: 0, organic: 0, referral: 0 });
    const entry = pageMap.get(page)!;
    if (medium === "paidsocial")    entry.paid     += n;
    else if (medium === "organic")  entry.organic  += n;
    else                            entry.referral += n;
  }

  return Array.from(pageMap.entries()).map(([page, s]) => ({
    page,
    paidSessions:     s.paid,
    organicSessions:  s.organic,
    referralSessions: s.referral,
  }));
}

// Site-wide sessions across ALL traffic sources (no Pinterest filter) —
// the correct denominator for revenue attribution, since AdSense revenue
// is earned from all traffic, not just Pinterest-sourced sessions. Distinct
// from getGA4PinterestSessions(), which is scoped to sessionSource CONTAINS
// "pinterest" and is used for Pinterest-specific metrics elsewhere.
export async function getGA4TotalSessions(date: string): Promise<number> {
  const response = await analyticsData.properties.runReport({
    property: `properties/${GA4_PROPERTY_ID}`,
    requestBody: {
      dateRanges: [{ startDate: date, endDate: date }],
      metrics: [{ name: "sessions" }],
    },
  });

  return parseInt(response.data.rows?.[0]?.metricValues?.[0]?.value ?? "0", 10);
}

export async function getAdSenseEarnings(): Promise<number> {
  const accountsResponse = await adsense.accounts.list();
  const accounts = accountsResponse.data.accounts || [];
  if (accounts.length === 0) {
    throw new Error("No AdSense accounts found.");
  }

  const accountName = accounts[0].name!;
  const yesterday = yesterdayDate();

  const report = await adsense.accounts.reports.generate({
    account: accountName,
    "startDate.year": yesterday.getFullYear(),
    "startDate.month": yesterday.getMonth() + 1,
    "startDate.day": yesterday.getDate(),
    "endDate.year": yesterday.getFullYear(),
    "endDate.month": yesterday.getMonth() + 1,
    "endDate.day": yesterday.getDate(),
    metrics: ["ESTIMATED_EARNINGS"],
    reportingTimeZone: "ACCOUNT_TIME_ZONE",
  });

  return parseFloat(report.data.totals?.cells?.[0]?.value || "0");
}
