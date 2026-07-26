// Monthly "new AI tools" scan — runs on the 26th of each month (the day this
// was first set up, 2026-07-26) via the daily Lambda pipeline. Uses Claude's
// server-side web_search tool to research recent AI tools/features relevant
// to Olga's actual workflow, then emails a summary via the same SES helper
// the daily reports already use.

import Anthropic from "@anthropic-ai/sdk";
import { sendEmail } from "./sesClient";
import { sendTelegramMessage } from "./telegramClient";

const TELEGRAM_LIMIT = 4096; // Telegram's hard per-message character cap

const RESEARCH_PROMPT = `I run cross-stitch.com, a solo-built e-commerce/content site, and I'm looking for genuinely new AI tools, products, or features (from roughly the last 1-2 months) that would be useful to me — both broad categories relevant to my overall situation, AND things that plug into specific parts of my site. NOT a generic "best AI tools" listicle.

My overall situation: I run this as a one-person operation. My stack is a Next.js/TypeScript web app on AWS Elastic Beanstalk, DynamoDB, a WPF/C# uploader app, and a suite of Node/TypeScript automation scripts on AWS Lambda. I do almost all development through Claude Code (Anthropic's CLI coding agent).

Here is exactly what I have on the site, so you can search for things that would actually plug into it:

- **The pattern editor** (a web tool at /photo-to-cross-stitch): a user uploads or drags in a photo, it gets converted to a cross-stitch grid — quantizing the image down to a limited palette matched against real DMC embroidery thread colors, then rendering a stitch chart (colored squares or printed symbols) exportable as a multi-page PDF with a color key.
- **AI-generated SEO content at catalog scale**: for each of ~5271 product pages (individual cross-stitch designs), I use Claude's vision capability to look at the product photo and generate a unique title/description/"did you know" fact, plus detect near-duplicate or template-variant images that would otherwise read as thin/duplicate content to Google.
- **Small-scale email newsletter automation via AWS SES**: I send a periodic newsletter and occasional announcement emails to a low-thousands subscriber list via SES from my own Lambda pipeline, not a SaaS ESP.

Search across all of these angles:
1. New Claude/Anthropic API or Claude Code features I might not know about yet
2. AI coding/agent tools relevant to a solo developer working across TypeScript, C#/.NET, and AWS infrastructure
3. New/better approaches to photo-to-pixel-art or photo-to-limited-palette conversion, perceptual color-matching against a fixed real-world swatch/paint/thread library, or anything specific to cross-stitch/needlework/embroidery pattern generation (competitor products, open-source libraries, new algorithms)
4. New vision-model capabilities relevant to bulk product-catalog description generation, near-duplicate/perceptual-hash image detection improvements, or SEO tooling aimed specifically at "many similar product pages" e-commerce catalogs
5. AI-powered SEO/content-generation tools relevant to a content-heavy e-commerce catalog site generally (not just blog-post writers)
6. AI tools for small-scale email marketing/newsletter automation generally, and anything specifically relevant to self-hosted/API-driven (not Mailchimp/Klaviyo-style SaaS) small-list email — deliverability, AI-assisted content, engagement analysis

For each item found, name it, say in one sentence what it actually does, and in one sentence why it's relevant — tying it to one of the six angles above (or to my overall situation) where you can, but general-category items don't need to map to a specific site feature. Group the list under two headings: "General" and "Specific to your site" so both kinds are easy to tell apart. At most 8 items total - be selective rather than exhaustive, and don't run more searches than you need to find good ones. If you don't find anything genuinely new and noteworthy this month, say so plainly rather than padding the list with things I likely already know about (e.g. don't describe ChatGPT or GitHub Copilot as if they were news).`;

export interface AiToolsScanResult {
  skipped: boolean;
  reason?: string;
  messageId?: string;
}

const SEND_DAY_OF_MONTH = 26; // anchored to 2026-07-26, the day this was set up

function isSendDay(date: Date): boolean {
  return date.getUTCDate() === SEND_DAY_OF_MONTH;
}

// Server-side web search runs its own internal loop (search -> fetch -> filter)
// and stops itself with stop_reason "pause_turn" after 10 rounds if not resumed.
// The loop below resumes on pause_turn (per Anthropic's documented pattern)
// instead of returning whatever text happened to exist at that point.
//
// max_uses bounds the search count. It was first set to 6, which was too low
// for this prompt's 6 research angles - every search past the 6th returned
// a web_search_tool_result_error with error_code "max_uses_exceeded" (verified
// via scripts/_diag_search_error.ts), and the model kept hedging around that
// failure instead of ever completing real research. This is a per-request cap,
// not a time-windowed account rate limit - it does not "clear" by waiting.
const MAX_SEARCH_USES = 15;
const MAX_CONTINUATIONS = 2;

/** Runs the research call and returns the raw text, without sending anything. */
export async function generateAiToolsScanText(): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });
  const tools: Anthropic.Tool[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCH_USES } as unknown as Anthropic.Tool,
  ];
  let messages: Anthropic.MessageParam[] = [{ role: "user", content: RESEARCH_PROMPT }];

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

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");

  return text.trim() ? text : null;
}

export async function sendAiToolsScanIfDue(now: Date = new Date()): Promise<AiToolsScanResult> {
  if (!isSendDay(now)) {
    return { skipped: true, reason: `not the ${SEND_DAY_OF_MONTH}th of the month` };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { skipped: true, reason: "ANTHROPIC_API_KEY not set" };
  }

  const text = await generateAiToolsScanText();
  if (!text) {
    return { skipped: true, reason: "empty response from research call" };
  }

  const monthLabel = now.toISOString().slice(0, 7);
  const { messageId } = await sendEmail({
    subject: `[cross-stitch] AI tools worth knowing about — ${monthLabel}`,
    textBody: text,
  });

  const telegramHeader = `🤖 <b>AI tools scan</b> — ${monthLabel}\n\n`;
  const telegramBudget = TELEGRAM_LIMIT - telegramHeader.length - 40; // room for the truncation note
  const telegramBody = text.length > telegramBudget
    ? `${text.slice(0, telegramBudget)}\n\n[truncated — full list in email]`
    : text;
  await sendTelegramMessage(telegramHeader + telegramBody).catch((err) =>
    console.error("[aiToolsScan] Telegram send failed:", err instanceof Error ? err.message : err)
  );

  return { skipped: false, messageId };
}
