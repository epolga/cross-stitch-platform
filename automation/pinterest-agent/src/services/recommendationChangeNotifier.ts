// Checks whether the latest AI trend recommendation differs from the previous
// one. If so — and if the change hasn't already been notified — sends an email
// via SES and marks the row changeNotified=true. Idempotent on re-run.

import { queryRange, markAiAnalysisChangeNotified } from "./historyStore";
import { sendEmail } from "./sesClient";
import { sendTelegramMessage } from "./telegramClient";

interface TrendRow {
  SortKey: string;
  forDate: string;
  recommendedAction?: string;
  confidence?: number;
  reasoning?: string;
  changeNotified?: boolean;
}

function actionEmoji(action: string): string {
  if (action === "increase_budget") return "▲";
  if (action === "decrease_budget") return "▼";
  return "→";
}

function actionLabel(action: string): string {
  return action.replace(/_/g, " ");
}

export interface ChangeNotifyResult {
  sent: boolean;
  from?: string;
  to?: string;
  messageId?: string;
}

export async function notifyRecommendationChange(): Promise<ChangeNotifyResult> {
  const rows = await queryRange<TrendRow>("AI_ANALYSIS", { scanForward: false, limit: 30 });
  const trends = rows.filter((r) => r.SortKey.endsWith("#trend"));

  if (trends.length < 2) return { sent: false };

  const [latest, previous] = trends;

  if (latest.changeNotified) return { sent: false };
  if (!latest.recommendedAction || !previous.recommendedAction) return { sent: false };
  if (latest.recommendedAction === previous.recommendedAction) return { sent: false };

  const from = previous.recommendedAction;
  const to = latest.recommendedAction;
  const fromEmoji = actionEmoji(from);
  const toEmoji = actionEmoji(to);
  const confPct = latest.confidence != null ? `${Math.round(latest.confidence * 100)}%` : null;
  const confColor =
    (latest.confidence ?? 0) >= 0.75 ? "#2a7" : (latest.confidence ?? 0) >= 0.5 ? "#c80" : "#c33";

  const subject = `[cross-stitch] Recommendation changed: ${actionLabel(from)} → ${actionLabel(to)}`;

  const textLines = [
    `AI budget recommendation changed for ${latest.forDate}:`,
    ``,
    `  Previous: ${fromEmoji} ${actionLabel(from)}  (for ${previous.forDate})`,
    `  New:      ${toEmoji} ${actionLabel(to)}`,
    ...(confPct ? [`  Confidence: ${confPct}`] : []),
    ...(latest.reasoning ? [``, `Reasoning:`, `  ${latest.reasoning}`] : []),
    ``,
    `Schema: CrossStitchBusinessHistory[AI_ANALYSIS].`,
  ];

  const htmlBody = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;color:#222;max-width:640px;margin:24px">
<h2 style="margin-bottom:4px">AI recommendation changed</h2>
<p style="color:#888;margin-top:0">${latest.forDate}</p>
<table style="border-collapse:collapse;margin:16px 0">
  <tr><td style="padding:6px 14px;border-bottom:1px solid #eee;color:#555">Previous</td>
      <td style="padding:6px 14px;border-bottom:1px solid #eee">${fromEmoji} ${actionLabel(from)} <span style="color:#999">(${previous.forDate})</span></td></tr>
  <tr><td style="padding:6px 14px;border-bottom:1px solid #eee;color:#555">New</td>
      <td style="padding:6px 14px;border-bottom:1px solid #eee"><b>${toEmoji} ${actionLabel(to)}</b></td></tr>
  ${confPct ? `<tr><td style="padding:6px 14px;border-bottom:1px solid #eee;color:#555">Confidence</td>
      <td style="padding:6px 14px;border-bottom:1px solid #eee;color:${confColor}"><b>${confPct}</b></td></tr>` : ""}
  ${latest.reasoning ? `<tr><td style="padding:6px 14px;color:#555;vertical-align:top">Reasoning</td>
      <td style="padding:6px 14px;font-style:italic">${latest.reasoning}</td></tr>` : ""}
</table>
<p style="color:#999;font-size:12px;margin-top:24px">Schema: <code>CrossStitchBusinessHistory[AI_ANALYSIS]</code>.</p>
</body></html>`;

  const { messageId } = await sendEmail({
    subject,
    textBody: textLines.join("\n") + "\n",
    htmlBody,
  });

  const tgText = [
    `📊 <b>Recommendation changed</b> — ${latest.forDate}`,
    `${fromEmoji} ${actionLabel(from)} → ${toEmoji} <b>${actionLabel(to)}</b>`,
    ...(confPct ? [`Confidence: ${confPct}`] : []),
  ].join("\n");
  await sendTelegramMessage(tgText).catch(() => {/* non-fatal */});

  await markAiAnalysisChangeNotified(latest.SortKey);

  return { sent: true, from, to, messageId };
}
