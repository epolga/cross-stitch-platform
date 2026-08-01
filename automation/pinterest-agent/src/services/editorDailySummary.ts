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

// Every `source` value any "Open in editor" / "Turn your own photo" CTA
// across the site passes through `?source=` — see ConvertClient.tsx's
// `editor_opened` tracking (source falls back to "referrer"/"direct" when
// the link carries no ?source= at all). Kept here so the report can label
// a source even if its count is 0 today.
const SOURCE_LABELS: Record<string, string> = {
  design_page_catalog: 'design page — "Open this pattern in the editor"',
  design_list_catalog: 'catalog list card — "Open in editor"',
  design_page: 'design page — "Turn your own photo into a pattern"',
  album_page: 'album page — "Turn your own photo into a pattern"',
  beginner_patterns_page: '"Easy patterns for beginners" page CTA',
  small_patterns_page: '"Small patterns" page CTA',
  referrer: 'external referrer (no ?source= on the link)',
  direct: 'direct / no referrer',
};

const CATALOG_SOURCES = new Set(['design_page_catalog', 'design_list_catalog']);

const KNOWN_EVENT_TYPES = [
  'editor_opened',
  'pattern_generated',
  'pdf_exported',
  'feedback_submitted',
  'editor_error',
] as const;
type KnownEventType = typeof KNOWN_EVENT_TYPES[number];

interface EventCounts {
  editor_opened: number;
  pattern_generated: number;
  pdf_exported: number;
  feedback_submitted: number;
  editor_error: number;
  // Sum of catalog_pattern_opens across both catalog entry points (design
  // page + list card) — kept as a single total for the top-line funnel.
  catalog_pattern_opens: number;
  // Raw per-source counts of editor_opened, for the detailed breakdown.
  bySource: Record<string, number>;
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
    catalog_pattern_opens: 0,
    bySource: {},
  };
  const knownEventTypes: readonly string[] = KNOWN_EVENT_TYPES;
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
      if (et && knownEventTypes.includes(et)) counts[et as KnownEventType]++;
      if (et === "editor_opened") {
        const src = item.source?.S || "unknown";
        counts.bySource[src] = (counts.bySource[src] || 0) + 1;
        if (CATALOG_SOURCES.has(src)) counts.catalog_pattern_opens++;
      }
    }
    lastKey = LastEvaluatedKey as Record<string, AttributeValue> | undefined;
  } while (lastKey);
  return counts;
}

function sourceLabel(src: string): string {
  return SOURCE_LABELS[src] ?? src;
}

// Sources with a nonzero count today, sorted highest-first.
function topSources(counts: EventCounts): Array<[string, number]> {
  return Object.entries(counts.bySource)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
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
- Feedback submitted: ${average(baseline.map(b => b.feedback_submitted)).toFixed(1)}
- Opened via catalog "Open in editor" button: ${average(baseline.map(b => b.catalog_pattern_opens)).toFixed(1)}`
    : "\nNo baseline history available yet.";

  const prompt = `Cross-stitch editor usage for ${date}:
- Sessions opened: ${counts.editor_opened}
- Patterns generated: ${counts.pattern_generated}
- PDFs exported: ${counts.pdf_exported}
- Feedback submitted: ${counts.feedback_submitted}
- Errors: ${counts.editor_error}
- Opened via catalog "Open in editor" button: ${counts.catalog_pattern_opens} (${pct(counts.catalog_pattern_opens, counts.editor_opened)} of sessions)
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
  lines.push(`    via catalog "Open in editor" button: ${counts.catalog_pattern_opens} (${pct(counts.catalog_pattern_opens, counts.editor_opened)} of sessions)`);
  lines.push(`  Generated:  ${counts.pattern_generated}  (${pct(counts.pattern_generated, counts.editor_opened)} of sessions)`);
  lines.push(`  PDF export: ${counts.pdf_exported}  (${pct(counts.pdf_exported, counts.pattern_generated)} of generated)`);
  lines.push(`  Feedback:   ${counts.feedback_submitted}`);
  if (counts.editor_error > 0) lines.push(`  Errors:     ${counts.editor_error}`);
  const sources = topSources(counts);
  if (sources.length > 0) {
    lines.push("", "Sessions by source");
    for (const [src, n] of sources) {
      lines.push(`  ${n} (${pct(n, counts.editor_opened)})  ${sourceLabel(src)}`);
    }
  }
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
    row("&nbsp;&nbsp;via catalog \"Open in editor\" button", `${counts.catalog_pattern_opens} <span style="color:#888">(${pct(counts.catalog_pattern_opens, counts.editor_opened)} of sessions)</span>`),
    row("Patterns generated", `${counts.pattern_generated} <span style="color:#888">(${pct(counts.pattern_generated, counts.editor_opened)} of sessions)</span>`),
    row("PDFs exported", `${counts.pdf_exported} <span style="color:#888">(${pct(counts.pdf_exported, counts.pattern_generated)} of generated)</span>`),
    row("Feedback submitted", `${counts.feedback_submitted}`),
    ...(counts.editor_error > 0 ? [row("Errors", `<span style="color:#c33">${counts.editor_error}</span>`)] : []),
  ].join("\n");

  const sourceRows = topSources(counts)
    .map(([src, n]) => row(sourceLabel(src), `${n} <span style="color:#888">(${pct(n, counts.editor_opened)})</span>`))
    .join("\n");

  const sourceBlock = sourceRows
    ? `<h3 style="margin:24px 0 8px;font-size:15px">Sessions by source</h3>
<table style="border-collapse:collapse">
${sourceRows}
</table>`
    : "";

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

${sourceBlock}
${feedbackBlock}
${observationBlock}
</body></html>`;
}

function buildTelegramText(date: string, counts: EventCounts, observation: string): string {
  const lines = [
    `🧵 <b>Cross-stitch editor report</b> — ${date}`,
    `Sessions: ${counts.editor_opened}`,
    `  via catalog button: ${counts.catalog_pattern_opens} (${pct(counts.catalog_pattern_opens, counts.editor_opened)} of sessions)`,
    `Generated: ${counts.pattern_generated} (${pct(counts.pattern_generated, counts.editor_opened)} of sessions)`,
    `PDF export: ${counts.pdf_exported} (${pct(counts.pdf_exported, counts.pattern_generated)} of generated)`,
    `Feedback: ${counts.feedback_submitted}`,
  ];
  if (counts.editor_error > 0) lines.push(`Errors: ${counts.editor_error}`);
  const sources = topSources(counts);
  if (sources.length > 0) {
    lines.push("", "By source:");
    for (const [src, n] of sources) {
      lines.push(`  ${n} (${pct(n, counts.editor_opened)}) — ${sourceLabel(src)}`);
    }
  }
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
