// Reads yesterday's KPIs and the latest AI trend recommendation from DDB,
// then sends a daily summary email via SES.
// Called at the end of every cron run (daily-run.bat → npm run summary).

import { queryRange } from "./historyStore";
import { sendEmail } from "./sesClient";
import { sendTelegramMessage } from "./telegramClient";

interface DailyRow {
  SortKey: string; // date YYYY-MM-DD
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

interface AiRow {
  SortKey: string;
  forDate: string;
  analysisType: string;
  recommendedAction?: string;
  confidence?: number;
  reasoning?: string;
}

function pct(n: number): string {
  return (n * 100).toFixed(2) + "%";
}

function usd(n: number): string {
  const sign = n < 0 ? "-$" : "$";
  return sign + Math.abs(n).toFixed(2);
}

function actionEmoji(action: string): string {
  if (action === "increase_budget") return "▲";
  if (action === "decrease_budget") return "▼";
  return "→";
}

function actionLabel(action: string): string {
  return action.replace(/_/g, " ");
}

function formatTextBody(today: DailyRow, prev7: DailyRow[], trend: AiRow | null): string {
  const lines: string[] = [];
  lines.push(`Cross-stitch daily report — ${today.SortKey}`, "");

  lines.push("KPIs (yesterday)");
  lines.push(`  Spend:       ${usd(today.spend)}`);
  lines.push(`  Clicks:      ${today.clicks}  (outbound: ${today.outboundClicks})`);
  lines.push(`  Impressions: ${today.impressions}  (CTR: ${pct(today.ctr)})`);
  lines.push(`  Sessions:    ${today.ga4Sessions}  (paid: ${today.ga4PaidSessions}, organic: ${today.ga4OrganicSessions})`);
  lines.push(`  Revenue:     ${usd(today.adsenseRevenue)}`);
  lines.push(`  Profit:      ${usd(today.profit)}`);
  if (today.revenuePerHundredSessions != null) {
    lines.push(`  Rev/100s:    ${usd(today.revenuePerHundredSessions)}`);
  }

  if (prev7.length >= 3) {
    const avg = (fn: (r: DailyRow) => number) =>
      prev7.reduce((s, r) => s + fn(r), 0) / prev7.length;
    lines.push("", `7-day averages (${prev7.length} days)`);
    lines.push(`  Spend:    ${usd(avg((r) => r.spend))}`);
    lines.push(`  Clicks:   ${avg((r) => r.clicks).toFixed(0)}`);
    lines.push(`  Sessions: ${avg((r) => r.ga4Sessions).toFixed(0)}`);
    lines.push(`  Revenue:  ${usd(avg((r) => r.adsenseRevenue))}`);
    lines.push(`  Profit:   ${usd(avg((r) => r.profit))}`);
  }

  if (trend) {
    lines.push("", "AI trend recommendation");
    const emoji = actionEmoji(trend.recommendedAction ?? "");
    lines.push(`  Action:     ${emoji} ${actionLabel(trend.recommendedAction ?? "—")}`);
    if (trend.confidence != null) {
      lines.push(`  Confidence: ${Math.round(trend.confidence * 100)}%`);
    }
    if (trend.reasoning) {
      lines.push(`  Reasoning:  ${trend.reasoning}`);
    }
    lines.push(`  For date:   ${trend.forDate}`);
  }

  lines.push("", "Schema: CrossStitchBusinessHistory[DAILY_BUSINESS / AI_ANALYSIS].");
  return lines.join("\n") + "\n";
}

function formatHtmlBody(today: DailyRow, prev7: DailyRow[], trend: AiRow | null): string {
  const kpiRows = [
    ["Spend", usd(today.spend)],
    ["Clicks", `${today.clicks} <span style="color:#888">(outbound: ${today.outboundClicks})</span>`],
    ["Impressions", `${today.impressions} <span style="color:#888">(CTR: ${pct(today.ctr)})</span>`],
    ["Sessions", `${today.ga4Sessions} <span style="color:#888">(paid: ${today.ga4PaidSessions}, organic: ${today.ga4OrganicSessions})</span>`],
    ["Revenue", usd(today.adsenseRevenue)],
    ["Profit", `<b style="color:${today.profit >= 0 ? "#2a7" : "#c33"}">${usd(today.profit)}</b>`],
    ...(today.revenuePerHundredSessions != null
      ? [["Rev / 100 sessions", usd(today.revenuePerHundredSessions)]]
      : []),
  ]
    .map(([label, value]) => `<tr><td style="padding:5px 14px;border-bottom:1px solid #eee;color:#555">${label}</td><td style="padding:5px 14px;border-bottom:1px solid #eee">${value}</td></tr>`)
    .join("\n");

  let avgBlock = "";
  if (prev7.length >= 3) {
    const avg = (fn: (r: DailyRow) => number) =>
      (prev7.reduce((s, r) => s + fn(r), 0) / prev7.length);
    const avgProfit = avg((r) => r.profit);
    const avgRows = [
      ["Spend", usd(avg((r) => r.spend))],
      ["Clicks", avg((r) => r.clicks).toFixed(0)],
      ["Sessions", avg((r) => r.ga4Sessions).toFixed(0)],
      ["Revenue", usd(avg((r) => r.adsenseRevenue))],
      ["Profit", `<b style="color:${avgProfit >= 0 ? "#2a7" : "#c33"}">${usd(avgProfit)}</b>`],
    ]
      .map(([label, value]) => `<tr><td style="padding:5px 14px;border-bottom:1px solid #eee;color:#555">${label}</td><td style="padding:5px 14px;border-bottom:1px solid #eee">${value}</td></tr>`)
      .join("\n");
    avgBlock = `
<h3 style="margin:24px 0 8px;font-size:15px">7-day averages <span style="font-weight:normal;color:#888">(${prev7.length} days)</span></h3>
<table style="border-collapse:collapse">${avgRows}</table>`;
  }

  let trendBlock = "";
  if (trend) {
    const emoji = actionEmoji(trend.recommendedAction ?? "");
    const confPct = trend.confidence != null ? Math.round(trend.confidence * 100) + "%" : "—";
    const confColor = (trend.confidence ?? 0) >= 0.75 ? "#2a7" : (trend.confidence ?? 0) >= 0.5 ? "#c80" : "#c33";
    trendBlock = `
<h3 style="margin:24px 0 8px;font-size:15px">AI trend recommendation</h3>
<table style="border-collapse:collapse">
  <tr><td style="padding:5px 14px;border-bottom:1px solid #eee;color:#555">Action</td><td style="padding:5px 14px;border-bottom:1px solid #eee"><b>${emoji} ${actionLabel(trend.recommendedAction ?? "—")}</b></td></tr>
  <tr><td style="padding:5px 14px;border-bottom:1px solid #eee;color:#555">Confidence</td><td style="padding:5px 14px;border-bottom:1px solid #eee;color:${confColor}"><b>${confPct}</b></td></tr>
  ${trend.reasoning ? `<tr><td style="padding:5px 14px;border-bottom:1px solid #eee;color:#555">Reasoning</td><td style="padding:5px 14px;border-bottom:1px solid #eee;font-style:italic">${trend.reasoning}</td></tr>` : ""}
  <tr><td style="padding:5px 14px;color:#555">For date</td><td style="padding:5px 14px;color:#888">${trend.forDate}</td></tr>
</table>`;
  }

  return `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;color:#222;max-width:640px;margin:24px">
<h2 style="margin-bottom:4px">Cross-stitch daily report</h2>
<p style="color:#888;margin-top:0">${today.SortKey}</p>
<h3 style="margin:0 0 8px;font-size:15px">KPIs (yesterday)</h3>
<table style="border-collapse:collapse">${kpiRows}</table>
${avgBlock}
${trendBlock}
<p style="color:#999;font-size:12px;margin-top:24px">Schema: <code>CrossStitchBusinessHistory[DAILY_BUSINESS / AI_ANALYSIS]</code>.</p>
</body></html>
`;
}

export async function sendDailySummary(): Promise<{ messageId: string; date: string }> {
  // Last 7 DAILY_BUSINESS rows (descending = most recent first)
  const rows = await queryRange<DailyRow>("DAILY_BUSINESS", { scanForward: false, limit: 7 });
  if (rows.length === 0) throw new Error("No DAILY_BUSINESS rows found in DDB");

  const [today, ...prev6] = rows;
  const prev7 = [today, ...prev6]; // all 7 for averages; today is most recent

  // Latest AI trend recommendation (scan descending, pick first trend row)
  const aiRows = await queryRange<AiRow>("AI_ANALYSIS", { scanForward: false, limit: 30 });
  const trend = aiRows.find((r) => r.analysisType === "trend") ?? null;

  const subject = `[cross-stitch] Daily report — ${today.SortKey}  ${usd(today.profit)} profit`;

  const { messageId } = await sendEmail({
    subject,
    textBody: formatTextBody(today, prev7, trend),
    htmlBody: formatHtmlBody(today, prev7, trend),
  });

  const profitSign = today.profit >= 0 ? "+" : "";
  const trendLine = trend
    ? `${actionEmoji(trend.recommendedAction ?? "")} ${actionLabel(trend.recommendedAction ?? "—")}`
    : "—";
  const tgText = [
    `📈 <b>Daily report</b> — ${today.SortKey}`,
    `Spend: ${usd(today.spend)}  Revenue: ${usd(today.adsenseRevenue)}  Profit: <b>${profitSign}${usd(today.profit)}</b>`,
    `Sessions: ${today.ga4Sessions}  Clicks: ${today.clicks}`,
    `AI: ${trendLine}`,
  ].join("\n");
  await sendTelegramMessage(tgText).catch(() => {/* non-fatal */});

  return { messageId, date: today.SortKey };
}
