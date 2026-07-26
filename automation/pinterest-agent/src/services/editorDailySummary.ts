// Daily editor analytics email — sent by the Lambda pipeline as step 12.
// Queries EditorEvents DDB for the given date, calls Claude Haiku for a brief
// observation, and dispatches via SES. Skips silently when 0 sessions.

import {
  DynamoDBClient,
  QueryCommand,
  ScanCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
import Anthropic from "@anthropic-ai/sdk";
import { sendEmail } from "./sesClient";
import { sendTelegramMessage } from "./telegramClient";

const REGION = process.env.AWS_REGION || "us-east-1";
const EDITOR_EVENTS_TABLE = process.env.DDB_EDITOR_EVENTS_TABLE || "EditorEvents";
const FEATURE_REQUESTS_TABLE = process.env.DDB_FEATURE_REQUESTS_TABLE || "FeatureRequests";

const ddb = new DynamoDBClient({ region: REGION });

interface EventCounts {
  editor_opened: number;
  pattern_generated: number;
  pdf_exported: number;
  feedback_submitted: number;
  editor_error: number;
  [key: string]: number;
}

interface FeedbackRow {
  text: string;
  importance: string;
  createdAt: string;
}

async function getEventCounts(date: string): Promise<EventCounts> {
  const counts: EventCounts = {
    editor_opened: 0,
    pattern_generated: 0,
    pdf_exported: 0,
    feedback_submitted: 0,
    editor_error: 0,
  };
  let lastKey: Record<string, AttributeValue> | undefined;
  do {
    const { Items = [], LastEvaluatedKey } = await ddb.send(new QueryCommand({
      TableName: EDITOR_EVENTS_TABLE,
      IndexName: "date-eventType-index",
      KeyConditionExpression: "#date = :date",
      ExpressionAttributeNames: { "#date": "date" },
      ExpressionAttributeValues: { ":date": { S: date } },
      ExclusiveStartKey: lastKey,
    }));
    for (const item of Items) {
      const et = item.eventType?.S;
      if (et && et in counts) counts[et]++;
    }
    lastKey = LastEvaluatedKey as Record<string, AttributeValue> | undefined;
  } while (lastKey);
  return counts;
}

const BASELINE_DAYS = 7;

async function getBaselineCounts(beforeDate: string, days: number): Promise<EventCounts[]> {
  const base = new Date(`${beforeDate}T00:00:00Z`);
  const results: EventCounts[] = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    results.push(await getEventCounts(d.toISOString().slice(0, 10)));
  }
  return results;
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

async function getFeedbackForDate(date: string): Promise<FeedbackRow[]> {
  const rows: FeedbackRow[] = [];
  let lastKey: Record<string, AttributeValue> | undefined;
  do {
    const { Items = [], LastEvaluatedKey } = await ddb.send(new ScanCommand({
      TableName: FEATURE_REQUESTS_TABLE,
      FilterExpression: "begins_with(createdAt, :date)",
      ExpressionAttributeValues: { ":date": { S: date } },
      ExclusiveStartKey: lastKey,
    }));
    for (const item of Items) {
      if (item.text?.S) {
        rows.push({
          text: item.text.S,
          importance: item.importance?.S ?? "unknown",
          createdAt: item.createdAt?.S ?? "",
        });
      }
    }
    lastKey = LastEvaluatedKey as Record<string, AttributeValue> | undefined;
  } while (lastKey);
  return rows;
}

async function getAiObservation(date: string, counts: EventCounts, feedback: FeedbackRow[], baseline: EventCounts[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "";

  const feedbackSection = feedback.length > 0
    ? `\nFeedback received (${feedback.length}):\n` + feedback.map(f => `- [${f.importance}] "${f.text}"`).join("\n")
    : "\nNo feedback received.";

  const baselineSection = baseline.length > 0
    ? `\n${baseline.length}-day trailing average (the ${baseline.length} days before ${date}, for comparison — do not treat today in isolation):
- Sessions: ${average(baseline.map(b => b.editor_opened)).toFixed(0)}
- Patterns generated: ${average(baseline.map(b => b.pattern_generated)).toFixed(0)}
- PDFs exported: ${average(baseline.map(b => b.pdf_exported)).toFixed(0)}
- Feedback submitted: ${average(baseline.map(b => b.feedback_submitted)).toFixed(1)}`
    : "\nNo baseline history available yet.";

  const prompt = `Cross-stitch editor usage for ${date}:
- Sessions opened: ${counts.editor_opened}
- Patterns generated: ${counts.pattern_generated}
- PDFs exported: ${counts.pdf_exported}
- Feedback submitted: ${counts.feedback_submitted}
- Errors: ${counts.editor_error}
${baselineSection}
${feedbackSection}

In 2-3 sentences, give a concise observation about today's editor usage COMPARED TO THE BASELINE ABOVE. Only call out something as unusual if it meaningfully deviates from the baseline average — otherwise say plainly that today is in line with recent usage. Do not use generic engagement language ("high engagement", "strong conversion", etc.) unless the numbers actually support that relative to baseline. Zero feedback is not worth commenting on unless it also deviates from the baseline. Be direct and actionable.`;

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });
  const block = msg.content[0];
  return block.type === "text" ? block.text.trim() : "";
}

function pct(num: number, denom: number): string {
  if (denom === 0) return "—";
  return ((num / denom) * 100).toFixed(0) + "%";
}

function buildTextBody(date: string, counts: EventCounts, feedback: FeedbackRow[], observation: string): string {
  const lines: string[] = [];
  lines.push(`Cross-stitch editor report — ${date}`, "");
  lines.push("Funnel");
  lines.push(`  Sessions:   ${counts.editor_opened}`);
  lines.push(`  Generated:  ${counts.pattern_generated}  (${pct(counts.pattern_generated, counts.editor_opened)} of sessions)`);
  lines.push(`  PDF export: ${counts.pdf_exported}  (${pct(counts.pdf_exported, counts.pattern_generated)} of generated)`);
  lines.push(`  Feedback:   ${counts.feedback_submitted}`);
  if (counts.editor_error > 0) lines.push(`  Errors:     ${counts.editor_error}`);
  if (feedback.length > 0) {
    lines.push("", "Feedback received");
    for (const f of feedback) {
      lines.push(`  [${f.importance}] "${f.text}"`);
    }
  }
  if (observation) {
    lines.push("", "AI observation");
    lines.push(`  ${observation}`);
  }
  return lines.join("\n");
}

function buildHtmlBody(date: string, counts: EventCounts, feedback: FeedbackRow[], observation: string): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:5px 14px;border-bottom:1px solid #eee;color:#555">${label}</td><td style="padding:5px 14px;border-bottom:1px solid #eee">${value}</td></tr>`;

  const funnelRows = [
    row("Sessions opened",  `<b>${counts.editor_opened}</b>`),
    row("Patterns generated", `${counts.pattern_generated} <span style="color:#888">(${pct(counts.pattern_generated, counts.editor_opened)} of sessions)</span>`),
    row("PDFs exported", `${counts.pdf_exported} <span style="color:#888">(${pct(counts.pdf_exported, counts.pattern_generated)} of generated)</span>`),
    row("Feedback submitted", `${counts.feedback_submitted}`),
    ...(counts.editor_error > 0 ? [row("Errors", `<span style="color:#c33">${counts.editor_error}</span>`)] : []),
  ].join("\n");

  const feedbackBlock = feedback.length > 0
    ? `<h3 style="margin:24px 0 8px;font-size:15px">Feedback received</h3>
<ul style="margin:0;padding-left:20px;line-height:1.7">
${feedback.map(f => `<li><span style="color:#888;font-size:12px">[${f.importance}]</span> "${f.text}"</li>`).join("\n")}
</ul>`
    : "";

  const observationBlock = observation
    ? `<h3 style="margin:24px 0 8px;font-size:15px">AI observation</h3>
<p style="margin:0;color:#333;font-style:italic;line-height:1.6">${observation}</p>`
    : "";

  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px">
<h2 style="margin:0 0 4px;font-size:18px">Cross-stitch editor — ${date}</h2>
<p style="color:#888;margin:0 0 20px;font-size:13px">Daily usage report</p>

<h3 style="margin:0 0 8px;font-size:15px">Funnel</h3>
<table style="border-collapse:collapse">
${funnelRows}
</table>

${feedbackBlock}
${observationBlock}
</body></html>`;
}

function buildTelegramText(date: string, counts: EventCounts, observation: string): string {
  const lines = [
    `🧵 <b>Cross-stitch editor report</b> — ${date}`,
    `Sessions: ${counts.editor_opened}`,
    `Generated: ${counts.pattern_generated} (${pct(counts.pattern_generated, counts.editor_opened)} of sessions)`,
    `PDF export: ${counts.pdf_exported} (${pct(counts.pdf_exported, counts.pattern_generated)} of generated)`,
    `Feedback: ${counts.feedback_submitted}`,
  ];
  if (counts.editor_error > 0) lines.push(`Errors: ${counts.editor_error}`);
  if (observation) lines.push("", observation);
  return lines.join("\n");
}

export interface EditorDailySummaryResult {
  skipped: boolean;
  reason?: string;
  messageId?: string;
  counts?: EventCounts;
}

export async function sendEditorDailySummary(date: string): Promise<EditorDailySummaryResult> {
  const counts = await getEventCounts(date);

  if (counts.editor_opened === 0) {
    return { skipped: true, reason: "no editor sessions" };
  }

  const feedback = await getFeedbackForDate(date);
  const baseline = await getBaselineCounts(date, BASELINE_DAYS).catch(() => []);
  const observation = await getAiObservation(date, counts, feedback, baseline).catch(() => "");

  const textBody = buildTextBody(date, counts, feedback, observation);
  const htmlBody = buildHtmlBody(date, counts, feedback, observation);

  const { messageId } = await sendEmail({
    subject: `[cross-stitch] Editor report ${date} — ${counts.editor_opened} sessions, ${counts.pdf_exported} PDFs`,
    textBody,
    htmlBody,
  });

  await sendTelegramMessage(buildTelegramText(date, counts, observation)).catch(() => {/* non-fatal */});

  return { skipped: false, messageId, counts };
}
