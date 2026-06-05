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

interface PinAttributionRow {
  SortKey: string;
  date: string;
  adId: string;
  title: string;
  clicks: number;
  outboundClicks: number;
  spend: number;
  attributedRevenue: number;
  profit: number;
}

interface PinDay {
  date: string;
  clicks: number;
  outboundClicks: number;
  spend: number;
  attributedRevenue: number;
  profit: number;
}

interface PinTrend {
  adId: string;
  title: string;
  days: PinDay[];           // ascending by date
  totals: PinDay;
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

function groupByPin(rows: PinAttributionRow[]): PinTrend[] {
  const map = new Map<string, PinTrend>();
  for (const r of rows) {
    if (!map.has(r.adId)) {
      map.set(r.adId, {
        adId: r.adId,
        title: r.title,
        days: [],
        totals: { date: "", clicks: 0, outboundClicks: 0, spend: 0, attributedRevenue: 0, profit: 0 },
      });
    }
    const pin = map.get(r.adId)!;
    pin.days.push({
      date: r.date,
      clicks: r.clicks,
      outboundClicks: r.outboundClicks,
      spend: r.spend,
      attributedRevenue: r.attributedRevenue,
      profit: r.profit,
    });
    pin.totals.clicks += r.clicks;
    pin.totals.outboundClicks += r.outboundClicks;
    pin.totals.spend += r.spend;
    pin.totals.attributedRevenue += r.attributedRevenue;
    pin.totals.profit += r.profit;
  }
  for (const pin of map.values()) {
    pin.days.sort((a, b) => a.date.localeCompare(b.date));
  }
  return [...map.values()].sort((a, b) => b.totals.profit - a.totals.profit);
}

function formatTextBody(today: DailyRow, prev7: DailyRow[], trend: AiRow | null, pinTrends: PinTrend[]): string {
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

  if (pinTrends.length > 0) {
    lines.push("", "Per-pin trend (revenue estimated by paid sessions)");
    for (const pin of pinTrends) {
      lines.push("", `  ${pin.title}`);
      lines.push("  Date        Clicks  Spend    Revenue  Profit");
      for (const d of pin.days) {
        const sign = d.profit >= 0 ? "+" : "";
        lines.push(
          `  ${d.date}  ${String(d.clicks).padStart(5)}  ${usd(d.spend).padStart(7)}  ~${usd(d.attributedRevenue).padStart(6)}  ~${sign}${usd(d.profit)}`
        );
      }
      if (pin.days.length > 1) {
        const sign = pin.totals.profit >= 0 ? "+" : "";
        lines.push(
          `  TOTAL          ${String(pin.totals.clicks).padStart(5)}  ${usd(pin.totals.spend).padStart(7)}  ~${usd(pin.totals.attributedRevenue).padStart(6)}  ~${sign}${usd(pin.totals.profit)}`
        );
      }
    }
  }

  lines.push("", "Schema: CrossStitchBusinessHistory[DAILY_BUSINESS / AI_ANALYSIS].");
  return lines.join("\n") + "\n";
}

function formatHtmlBody(today: DailyRow, prev7: DailyRow[], trend: AiRow | null, pinTrends: PinTrend[]): string {
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

  let pinsBlock = "";
  if (pinTrends.length > 0) {
    const pinSections = pinTrends.map((pin) => {
      const dayRows = pin.days.map((d) => {
        const sign = d.profit >= 0 ? "+" : "";
        const profitColor = d.profit >= 0 ? "#2a7" : "#c33";
        return `<tr>
          <td style="padding:4px 12px;border-bottom:1px solid #f0f0f0;color:#888;font-size:13px">${d.date}</td>
          <td style="padding:4px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px">${d.clicks}</td>
          <td style="padding:4px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px">${d.outboundClicks}</td>
          <td style="padding:4px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px">${usd(d.spend)}</td>
          <td style="padding:4px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;color:#888">~${usd(d.attributedRevenue)}</td>
          <td style="padding:4px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;color:${profitColor}"><b>~${sign}${usd(d.profit)}</b></td>
        </tr>`;
      }).join("\n");

      let totalRow = "";
      if (pin.days.length > 1) {
        const sign = pin.totals.profit >= 0 ? "+" : "";
        const profitColor = pin.totals.profit >= 0 ? "#2a7" : "#c33";
        totalRow = `<tr style="background:#f9f9f9">
          <td style="padding:4px 12px;font-size:13px;font-weight:bold">Total</td>
          <td style="padding:4px 12px;text-align:right;font-size:13px;font-weight:bold">${pin.totals.clicks}</td>
          <td style="padding:4px 12px;text-align:right;font-size:13px;font-weight:bold">${pin.totals.outboundClicks}</td>
          <td style="padding:4px 12px;text-align:right;font-size:13px;font-weight:bold">${usd(pin.totals.spend)}</td>
          <td style="padding:4px 12px;text-align:right;font-size:13px;color:#888;font-weight:bold">~${usd(pin.totals.attributedRevenue)}</td>
          <td style="padding:4px 12px;text-align:right;font-size:13px;color:${profitColor};font-weight:bold">~${sign}${usd(pin.totals.profit)}</td>
        </tr>`;
      }

      return `
<h4 style="margin:16px 0 4px;font-size:13px;color:#444">${pin.title}</h4>
<table style="border-collapse:collapse;width:100%">
  <thead><tr style="color:#555;font-size:12px;background:#f5f5f5">
    <th style="padding:4px 12px;border-bottom:1px solid #ddd;text-align:left">Date</th>
    <th style="padding:4px 12px;border-bottom:1px solid #ddd;text-align:right">Clicks</th>
    <th style="padding:4px 12px;border-bottom:1px solid #ddd;text-align:right">Out</th>
    <th style="padding:4px 12px;border-bottom:1px solid #ddd;text-align:right">Spend</th>
    <th style="padding:4px 12px;border-bottom:1px solid #ddd;text-align:right">Revenue</th>
    <th style="padding:4px 12px;border-bottom:1px solid #ddd;text-align:right">Profit</th>
  </tr></thead>
  <tbody>${dayRows}${totalRow}</tbody>
</table>`;
    }).join("\n");

    pinsBlock = `
<h3 style="margin:24px 0 4px;font-size:15px">Per-pin trend <span style="font-weight:normal;color:#888;font-size:13px">(last 7 days · revenue estimated by paid sessions)</span></h3>
${pinSections}`;
  }

  return `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;color:#222;max-width:680px;margin:24px">
<h2 style="margin-bottom:4px">Cross-stitch daily report</h2>
<p style="color:#888;margin-top:0">${today.SortKey}</p>
<h3 style="margin:0 0 8px;font-size:15px">KPIs (yesterday)</h3>
<table style="border-collapse:collapse">${kpiRows}</table>
${avgBlock}
${trendBlock}
${pinsBlock}
<p style="color:#999;font-size:12px;margin-top:24px">Schema: <code>CrossStitchBusinessHistory[DAILY_BUSINESS / AI_ANALYSIS]</code>.</p>
</body></html>
`;
}

function sevenDaysAgo(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 6); // include today → 7 days total
  return d.toISOString().slice(0, 10);
}

export async function sendDailySummary(): Promise<{ messageId: string; date: string }> {
  // Last 7 DAILY_BUSINESS rows (descending = most recent first)
  const rows = await queryRange<DailyRow>("DAILY_BUSINESS", { scanForward: false, limit: 7 });
  if (rows.length === 0) throw new Error("No DAILY_BUSINESS rows found in DDB");

  const [today, ...prev6] = rows;
  const prev7 = [today, ...prev6];

  // Latest AI trend recommendation (scan descending, pick first trend row)
  const aiRows = await queryRange<AiRow>("AI_ANALYSIS", { scanForward: false, limit: 30 });
  const trend = aiRows.find((r) => r.analysisType === "trend") ?? null;

  // Per-pin attribution for last 7 days, grouped by pin, sorted by total profit desc
  const pinStart = sevenDaysAgo(today.SortKey);
  const pinRows = await queryRange<PinAttributionRow>("PIN_ATTRIBUTION", {
    startKey: `${pinStart}#`,
    endKey: `${today.SortKey}#~`,
  });
  const pinTrends = groupByPin(pinRows);

  const subject = `[cross-stitch] Daily report — ${today.SortKey}  ${usd(today.profit)} profit`;

  const { messageId } = await sendEmail({
    subject,
    textBody: formatTextBody(today, prev7, trend, pinTrends),
    htmlBody: formatHtmlBody(today, prev7, trend, pinTrends),
  });

  // Telegram: top-3 pins by today's profit
  const profitSign = today.profit >= 0 ? "+" : "";
  const trendLine = trend
    ? `${actionEmoji(trend.recommendedAction ?? "")} ${actionLabel(trend.recommendedAction ?? "—")}`
    : "—";
  const tgLines = [
    `📈 <b>Daily report</b> — ${today.SortKey}`,
    `Spend: ${usd(today.spend)}  Revenue: ${usd(today.adsenseRevenue)}  Profit: <b>${profitSign}${usd(today.profit)}</b>`,
    `Sessions: ${today.ga4Sessions}  Clicks: ${today.clicks}`,
    `AI: ${trendLine}`,
  ];
  // today's pins = last day in each pin's days array (already sorted ascending)
  const todayPins = pinTrends
    .map((p) => p.days.at(-1)!)
    .filter((d) => d.date === today.SortKey)
    .sort((a, b) => b.profit - a.profit);
  if (todayPins.length > 0) {
    tgLines.push("");
    tgLines.push("🔝 <b>Top pins today</b>:");
    for (const [i, pin] of pinTrends.entries()) {
      const d = pin.days.find((x) => x.date === today.SortKey);
      if (!d || i >= 3) continue;
      const name = pin.title.length > 22 ? pin.title.slice(0, 21) + "…" : pin.title;
      const sign = d.profit >= 0 ? "+" : "";
      tgLines.push(`  ${name}: ${d.clicks}c  ${usd(d.spend)}sp  ~${usd(d.attributedRevenue)}rev  ~<b>${sign}${usd(d.profit)}</b>`);
    }
  }
  await sendTelegramMessage(tgLines.join("\n")).catch(() => {/* non-fatal */});

  return { messageId, date: today.SortKey };
}
