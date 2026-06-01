import { analyticsData, adsense, GA4_PROPERTY_ID } from "./googleClient";
import { yesterdayDate } from "./dateUtils";
import type { GA4PinterestSessions } from "./types";

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
