// Anomaly detection for the daily-business pipeline.
//
// Runs after `npm run history`, queries DAILY_BUSINESS rows from
// CrossStitchBusinessHistory, and flags any metric on the most recent day
// that deviates more than SIGMA_THRESHOLD standard deviations from its
// trailing-7-row mean. Each flagged metric becomes one ANOMALY_EVENT row
// (notified=false; notifications deferred to Milestone 8).
//
// "Trailing 7" uses the seven most recent rows BEFORE today, ignoring calendar
// gaps. If the cron missed a day, the trailing window slides by row count, not
// by calendar date. With <8 DAILY_BUSINESS rows total no detection runs.
//
// Schema reference: plan/integration/business-history-schema.md §4.6.

import {
  queryRange,
  putAnomaly,
  type AnomalyMetric,
} from "./historyStore";

export const SIGMA_THRESHOLD = 2;
export const TRAILING_WINDOW = 7;

export interface DailyRow {
  SortKey: string; // YYYY-MM-DD
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

const METRICS: { key: AnomalyMetric; pick: (r: DailyRow) => number | undefined }[] = [
  { key: "ctr", pick: (r) => r.ctr },
  { key: "revenuePerHundredSessions", pick: (r) => r.revenuePerHundredSessions },
  { key: "profit", pick: (r) => r.profit },
  { key: "ga4Sessions", pick: (r) => r.ga4Sessions },
];

export interface AnomalyResult {
  metric: AnomalyMetric;
  observedValue: number;
  expectedMean: number;
  expectedSigma: number;
  deviationSigmas: number;
  direction: "above" | "below";
}

export function detectAnomalies(rows: DailyRow[]): AnomalyResult[] {
  // rows are expected in ascending SortKey order; the last is "today".
  if (rows.length < TRAILING_WINDOW + 1) return [];

  const today = rows[rows.length - 1];
  const trailing = rows.slice(-TRAILING_WINDOW - 1, -1);

  const out: AnomalyResult[] = [];
  for (const { key, pick } of METRICS) {
    const observed = pick(today);
    if (observed === undefined || observed === null) continue;

    const vals = trailing
      .map(pick)
      .filter((v): v is number => v !== undefined && v !== null);
    if (vals.length < TRAILING_WINDOW) continue;

    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    const sigma = Math.sqrt(variance);
    if (sigma === 0) continue;

    const deviation = Math.abs(observed - mean) / sigma;
    if (deviation < SIGMA_THRESHOLD) continue;

    out.push({
      metric: key,
      observedValue: observed,
      expectedMean: mean,
      expectedSigma: sigma,
      deviationSigmas: deviation,
      direction: observed > mean ? "above" : "below",
    });
  }
  return out;
}

export interface DetectionRun {
  checked: boolean;
  forDate: string;
  rowsScanned: number;
  trailingSize: number;
  anomalies: AnomalyResult[];
  reason?: string;
}

export async function runAnomalyDetection(): Promise<DetectionRun> {
  const all = await queryRange<DailyRow>("DAILY_BUSINESS");
  if (all.length === 0) {
    return { checked: false, forDate: "", rowsScanned: 0, trailingSize: 0, anomalies: [], reason: "no DAILY_BUSINESS rows in DDB" };
  }
  const last30 = all.slice(-30);
  const today = last30[last30.length - 1];

  if (last30.length < TRAILING_WINDOW + 1) {
    return {
      checked: false,
      forDate: today.SortKey,
      rowsScanned: last30.length,
      trailingSize: Math.max(0, last30.length - 1),
      anomalies: [],
      reason: `need ≥${TRAILING_WINDOW + 1} rows; have ${last30.length}`,
    };
  }

  const anomalies = detectAnomalies(last30);

  if (anomalies.length > 0) {
    const detectedAt = new Date().toISOString();
    for (const a of anomalies) {
      await putAnomaly({
        detectedAt,
        forDate: today.SortKey,
        metric: a.metric,
        observedValue: a.observedValue,
        expectedMean: a.expectedMean,
        expectedSigma: a.expectedSigma,
        deviationSigmas: a.deviationSigmas,
        direction: a.direction,
        notified: false,
      });
    }
  }

  return {
    checked: true,
    forDate: today.SortKey,
    rowsScanned: last30.length,
    trailingSize: TRAILING_WINDOW,
    anomalies,
  };
}
