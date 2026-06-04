// Reads unnotified ANOMALY_EVENT rows from CrossStitchBusinessHistory,
// formats one summary email, sends it via SES, and marks each row as
// notified. Idempotent — a re-run after a successful send finds no
// unnotified rows and exits without sending again.
//
// Triggered nightly by daily-run.bat after `npm run anomaly` so the same
// cron run that detects an anomaly also delivers the alert.

import {
  queryRange,
  markAnomalyNotified,
  type AnomalyMetric,
} from "./historyStore";
import { sendEmail } from "./sesClient";
import { sendTelegramMessage } from "./telegramClient";

interface AnomalyRow {
  SortKey: string;
  detectedAt: string;
  forDate: string;
  metric: AnomalyMetric;
  observedValue: number;
  expectedMean: number;
  expectedSigma: number;
  deviationSigmas: number;
  direction: "above" | "below";
  notified?: boolean;
}

function fmtNumber(metric: AnomalyMetric, v: number): string {
  if (metric === "profit") return `$${v.toFixed(2)}`;
  if (metric === "revenuePerHundredSessions") return `$${v.toFixed(2)}`;
  if (metric === "ctr") return v.toFixed(4);
  return v.toFixed(0);
}

function formatTextBody(rows: AnomalyRow[]): string {
  const lines: string[] = [];
  const latestForDate = rows
    .map((r) => r.forDate)
    .sort()
    .at(-1)!;

  lines.push(
    `The cross-stitch Pinterest agent detected ${rows.length} metric(s) outside the trailing-7-row trend on ${latestForDate}:`,
    ""
  );
  for (const r of rows) {
    const observed = fmtNumber(r.metric, r.observedValue);
    const mean = fmtNumber(r.metric, r.expectedMean);
    const sigma = fmtNumber(r.metric, r.expectedSigma);
    lines.push(
      `  ${r.metric} (${r.direction}): observed=${observed}, mean=${mean}, σ=${sigma}, deviation=${r.deviationSigmas.toFixed(2)}σ  [forDate=${r.forDate}]`
    );
  }
  lines.push(
    "",
    "These are statistical signals only — no action recommended automatically.",
    "Check daily-run.log and reports/ai-analysis/*-trend-analysis.md before reacting.",
    "",
    "How to read this:",
    "  σ (sigma) is the standard deviation of the trailing 7 rows — the metric's",
    "  typical day-to-day wiggle. \"Deviation\" tells you how many of those wiggles",
    "  today's value sits away from the recent mean. The detector flags anything",
    "  at or above 2σ; 5σ+ is rare and usually a data issue or a real shock.",
    "",
    "Schema: CrossStitchBusinessHistory[ANOMALY_EVENT]."
  );
  return lines.join("\n") + "\n";
}

function formatHtmlBody(rows: AnomalyRow[]): string {
  const latestForDate = rows
    .map((r) => r.forDate)
    .sort()
    .at(-1)!;

  const rowsHtml = rows
    .map((r) => {
      const observed = fmtNumber(r.metric, r.observedValue);
      const mean = fmtNumber(r.metric, r.expectedMean);
      const sigma = fmtNumber(r.metric, r.expectedSigma);
      const arrow = r.direction === "above" ? "▲" : "▼";
      return `<tr>
  <td style="padding:6px 12px;border-bottom:1px solid #eee"><b>${r.metric}</b></td>
  <td style="padding:6px 12px;border-bottom:1px solid #eee">${arrow} ${r.direction}</td>
  <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${observed}</td>
  <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${mean}</td>
  <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${sigma}</td>
  <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${r.deviationSigmas.toFixed(2)}σ</td>
  <td style="padding:6px 12px;border-bottom:1px solid #eee">${r.forDate}</td>
</tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;color:#222;max-width:760px;margin:24px">
<h2 style="margin-bottom:4px">Cross-stitch agent — anomaly alert</h2>
<p style="color:#666;margin-top:0">${rows.length} metric(s) outside the trailing-7-row trend on <b>${latestForDate}</b></p>
<table style="border-collapse:collapse;margin-top:16px">
<thead><tr style="background:#f5f5f5">
  <th style="text-align:left;padding:6px 12px">Metric</th>
  <th style="text-align:left;padding:6px 12px">Direction</th>
  <th style="text-align:right;padding:6px 12px">Observed</th>
  <th style="text-align:right;padding:6px 12px">Mean</th>
  <th style="text-align:right;padding:6px 12px">σ</th>
  <th style="text-align:right;padding:6px 12px">Deviation</th>
  <th style="text-align:left;padding:6px 12px">For date</th>
</tr></thead>
<tbody>
${rowsHtml}
</tbody></table>
<p style="color:#666;font-size:13px;margin-top:24px;line-height:1.5">
  Statistical signals only — no action recommended automatically. Check <code>daily-run.log</code> and <code>reports/ai-analysis/*-trend-analysis.md</code> before reacting.
</p>
<p style="color:#666;font-size:13px;line-height:1.5;background:#fafafa;padding:10px 14px;border-left:3px solid #ddd">
  <b>How to read this:</b> <code>σ</code> (sigma) is the standard deviation of the trailing 7 rows — the metric's typical day-to-day wiggle. The "Deviation" column tells you how many of those wiggles today's value sits away from the recent mean. The detector flags anything at or above <b>2σ</b>; 5σ+ is rare and usually a data issue or a real shock.
</p>
<p style="color:#999;font-size:12px;margin-top:16px">
  Schema: <code>CrossStitchBusinessHistory[ANOMALY_EVENT]</code>.
</p>
</body></html>
`;
}

export interface NotifyResult {
  unnotifiedFound: number;
  sentMessageId: string | null;
  marked: number;
  markFailures: { detectedAt: string; metric: AnomalyMetric; error: string }[];
}

export async function notifyAnomalies(): Promise<NotifyResult> {
  const all = await queryRange<AnomalyRow>("ANOMALY_EVENT");
  const unnotified = all.filter((r) => r.notified !== true);

  if (unnotified.length === 0) {
    return { unnotifiedFound: 0, sentMessageId: null, marked: 0, markFailures: [] };
  }

  // Sort by forDate desc, then metric — newest day first for readability.
  unnotified.sort((a, b) => {
    if (a.forDate !== b.forDate) return a.forDate < b.forDate ? 1 : -1;
    return a.metric.localeCompare(b.metric);
  });

  const latestForDate = unnotified.map((r) => r.forDate).sort().at(-1)!;
  const subject = `[cross-stitch agent] ${unnotified.length} anomaly alert(s) — ${latestForDate}`;

  const { messageId } = await sendEmail({
    subject,
    textBody: formatTextBody(unnotified),
    htmlBody: formatHtmlBody(unnotified),
  });

  const telegramLines = [
    `⚠️ <b>${unnotified.length} anomaly alert(s)</b> — ${latestForDate}`,
    ...unnotified.map((r) => {
      const arrow = r.direction === "above" ? "▲" : "▼";
      return `${arrow} ${r.metric}: ${r.observedValue.toFixed(2)} (${r.deviationSigmas.toFixed(1)}σ)`;
    }),
  ];
  await sendTelegramMessage(telegramLines.join("\n")).catch(() => {/* non-fatal */});

  const markFailures: NotifyResult["markFailures"] = [];
  let marked = 0;
  for (const r of unnotified) {
    try {
      await markAnomalyNotified(r.detectedAt, r.metric);
      marked++;
    } catch (err) {
      markFailures.push({
        detectedAt: r.detectedAt,
        metric: r.metric,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    unnotifiedFound: unnotified.length,
    sentMessageId: messageId,
    marked,
    markFailures,
  };
}
