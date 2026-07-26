// Monthly competitor scan — separate from aiToolsScan.ts (which now
// deliberately excludes competitor products). Tracks both (a) new features/
// pricing changes on already-known competitors, and (b) newly-emerged
// competitors. Findings are upserted into DynamoDB (CrossStitchBusinessHistory,
// EntityType=COMPETITOR — see historyStore.ts) so tracking doesn't depend on
// manually editing web/plan/Cross-Stitch_Competitor_Analysis.md every month;
// that doc can be refreshed from the DDB rows periodically instead. Runs on
// the same day-of-month as the AI tools scan (26th) via the daily Lambda
// pipeline.

import Anthropic from "@anthropic-ai/sdk";
import { sendEmail } from "./sesClient";
import { sendTelegramMessage } from "./telegramClient";
import { getAllCompetitors, putCompetitor, type CompetitorInput } from "./historyStore";

const TELEGRAM_LIMIT = 4096;

// Seed list used only the first time this ever runs (before DDB has any
// COMPETITOR rows) — matches web/plan/Cross-Stitch_Competitor_Analysis.md
// as of 2026-07-26. Every subsequent run reads the live DDB rows instead, so
// this list never needs manual upkeep once at least one scan has completed.
const SEED_COMPETITORS = [
  "KnytStudio", "FlossCross", "Stitch Fiddle", "Pic2Pat",
  "WinStitch", "PCStitch", "Pattern Keeper",
  "Cross Stitch Professional Platinum", "Xstitchify",
];

const STRUCTURED_MARKER = "===STRUCTURED_JSON===";

function buildResearchPrompt(knownCompetitors: string[]): string {
  return `I run cross-stitch.com — a solo-built site combining a large SEO-driven catalog of ~5271 free downloadable cross-stitch patterns with a browser-based photo-to-pattern editor (upload a photo, it gets quantized to a limited palette matched against real DMC thread colors, rendered as a stitch chart exportable as PDF).

I track competitors (editor quality, pattern catalog, SEO strength, notable features). The competitors I already know about are: ${knownCompetitors.join(", ")}.

Do two things:
1. For each of the known competitors above, search for anything **new in roughly the last 1-2 months** — new features, pricing/subscription changes, notable growth or news. Skip any competitor where you find nothing new.
2. Search broadly for **competitors I don't have listed above** — new or existing web-based cross-stitch pattern editors, photo-to-cross-stitch converters, or pattern catalog sites that have launched or gained notable traction recently.

Write a human-readable report first: for each finding, the competitor name, one sentence on what's new/notable, and — for anything not already known — its editor/catalog/SEO positioning. Be selective — only genuinely new/notable information, not a restatement of things that haven't changed. If nothing new turns up for either part, say so plainly rather than padding the report.

Then, after the report, add a line containing exactly \`${STRUCTURED_MARKER}\` followed by a JSON array (in a \`\`\`json fenced block) with one object per competitor you actually reported something on above (skip ones with no news) — including the known ones you found updates for AND the new ones. Each object: {"name": string, "editor": "yes"|"no"|"limited"|null, "catalog": "yes"|"no"|null, "seo": "yes"|"no"|"unclear"|null, "notes": string (1-3 sentences, the finding itself), "url": string|null}. Use null for any field you're not confident about rather than guessing. This JSON is machine-parsed — it must be valid JSON and nothing else inside that fenced block.`;
}

export interface CompetitorScanResult {
  skipped: boolean;
  reason?: string;
  messageId?: string;
  competitorsUpdated?: number;
}

const SEND_DAY_OF_MONTH = 26; // same day as aiToolsScan.ts, set up 2026-07-26

function isSendDay(date: Date): boolean {
  return date.getUTCDate() === SEND_DAY_OF_MONTH;
}

// See aiToolsScan.ts for why this loop/cap shape exists: web_search's own
// internal loop self-stops with stop_reason "pause_turn" after 10 rounds
// and must be resumed, and max_uses is a per-request cap (not a rate limit
// that clears by waiting) that must be high enough for the prompt's search
// breadth (verified against the same max_uses_exceeded failure mode). This
// prompt covers more distinct entities (9+ known competitors + an open-ended
// new-competitor search) than aiToolsScan.ts's 6 angles — 15 and 30 were
// both observed hitting the cap mid-run (self-reported in the output,
// several leads left unverified) before 50 ran clean.
const MAX_SEARCH_USES = 50;
const MAX_CONTINUATIONS = 3;

interface RawScanOutput {
  narrative: string;
  structured: CompetitorInput[];
}

/** Runs the research call and returns the narrative text + parsed structured findings. */
export async function generateCompetitorScan(): Promise<RawScanOutput | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const existing = await getAllCompetitors().catch(() => []);
  const knownCompetitors = existing.length > 0 ? existing.map((c) => c.name) : SEED_COMPETITORS;

  const client = new Anthropic({ apiKey });
  const tools: Anthropic.Tool[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCH_USES } as unknown as Anthropic.Tool,
  ];
  let messages: Anthropic.MessageParam[] = [{ role: "user", content: buildResearchPrompt(knownCompetitors) }];

  let response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 6000,
    tools,
    messages,
  });

  let continuations = 0;
  while (response.stop_reason === "pause_turn" && continuations < MAX_CONTINUATIONS) {
    messages = [...messages, { role: "assistant", content: response.content }];
    response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 6000,
      tools,
      messages,
    });
    continuations++;
  }

  const fullText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");

  if (!fullText.trim()) return null;

  const markerIdx = fullText.indexOf(STRUCTURED_MARKER);
  const narrative = (markerIdx >= 0 ? fullText.slice(0, markerIdx) : fullText).trim();

  let structured: CompetitorInput[] = [];
  if (markerIdx >= 0) {
    const jsonMatch = fullText.slice(markerIdx).match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed)) {
          structured = parsed
            .filter((e): e is Record<string, unknown> => !!e && typeof e.name === "string" && typeof e.notes === "string")
            .map((e) => ({
              name: e.name as string,
              notes: e.notes as string,
              editor: (e.editor === "yes" || e.editor === "no" || e.editor === "limited") ? e.editor : undefined,
              catalog: (e.catalog === "yes" || e.catalog === "no") ? e.catalog : undefined,
              seo: (e.seo === "yes" || e.seo === "no" || e.seo === "unclear") ? e.seo : undefined,
              url: typeof e.url === "string" ? e.url : undefined,
            }));
        }
      } catch (err) {
        console.error("[competitorScan] Failed to parse structured JSON block:", err instanceof Error ? err.message : err);
      }
    } else {
      console.error("[competitorScan] STRUCTURED_JSON marker found but no ```json fenced block after it");
    }
  } else {
    console.error("[competitorScan] No STRUCTURED_JSON marker found in response — nothing will be written to DDB this run");
  }

  return { narrative, structured };
}

export async function sendCompetitorScanIfDue(now: Date = new Date()): Promise<CompetitorScanResult> {
  if (!isSendDay(now)) {
    return { skipped: true, reason: `not the ${SEND_DAY_OF_MONTH}th of the month` };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { skipped: true, reason: "ANTHROPIC_API_KEY not set" };
  }

  const result = await generateCompetitorScan();
  if (!result || !result.narrative) {
    return { skipped: true, reason: "empty response from research call" };
  }

  for (const finding of result.structured) {
    await putCompetitor(finding).catch((err) =>
      console.error(`[competitorScan] Failed to write competitor "${finding.name}" to DDB:`, err instanceof Error ? err.message : err)
    );
  }

  const monthLabel = now.toISOString().slice(0, 7);
  const { messageId } = await sendEmail({
    subject: `[cross-stitch] Competitor scan — ${monthLabel}`,
    textBody: result.narrative + `\n\n(${result.structured.length} competitor row(s) upserted to DynamoDB — CrossStitchBusinessHistory, EntityType=COMPETITOR.)`,
  });

  const telegramHeader = `🔍 <b>Competitor scan</b> — ${monthLabel}\n\n`;
  const telegramBudget = TELEGRAM_LIMIT - telegramHeader.length - 40;
  const telegramBody = result.narrative.length > telegramBudget
    ? `${result.narrative.slice(0, telegramBudget)}\n\n[truncated — full report in email]`
    : result.narrative;
  await sendTelegramMessage(telegramHeader + telegramBody).catch((err) =>
    console.error("[competitorScan] Telegram send failed:", err instanceof Error ? err.message : err)
  );

  return { skipped: false, messageId, competitorsUpdated: result.structured.length };
}
