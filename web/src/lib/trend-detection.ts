// Track 2 (Opportunity 9) step 1 of the design-generation pipeline: find
// ONE concrete, currently-trending cross-stitch theme to generate a
// candidate design for. See docs/genai-growth/OPPORTUNITIES.md's
// "Opportunity 9" section for the full design rationale — this file
// implements its "Trend detection — concrete design" subsection.
//
// Reuses the proven web_search + pause_turn pattern from
// automation/pinterest-agent/src/services/aiToolsScan.ts, but returns
// structured JSON (this feeds the next pipeline step automatically, no
// human reads the raw text) instead of that file's free-text email body.

import Anthropic from '@anthropic-ai/sdk';
import { getAllAlbumCaptions } from './data-access';

export interface ParsedTrend {
  theme: string;
  imagePrompt: string;
  signalSource: string;
  reasoning: string;
  // Added 2026-08-08 (Olga's ask): research isn't just "what theme" — also
  // "what size and color combination are popular in cross-stitch-pattern
  // searches right now." targetWidth/targetHeight are approximate finished
  // size in stitches (not inches — fabric count varies), a starting point
  // for the conversion step, not a hard requirement. colorPalette describes
  // the SUBJECT's dominant colors only — the background stays solid flat
  // white regardless (see imagePrompt instructions below), that constraint
  // is about the conversion pipeline's background-erasure step, unrelated
  // to which colors are currently popular.
  targetWidth: number;
  targetHeight: number;
  colorPalette: string;
}

export interface TrendDetectionResult extends ParsedTrend {
  grounding: GroundingAssessment;
}

// Same cap and reasoning as aiToolsScan.ts: max_uses bounds the search
// count per request (it's a per-request cap, not a time-windowed rate
// limit) — 15 was the value that stopped aiToolsScan's 6-angle prompt
// from hitting max_uses_exceeded. This prompt asks for one theme instead
// of six research angles, so it very likely needs far fewer searches in
// practice, but the ceiling itself is cheap to leave generous.
const MAX_SEARCH_USES = 15;
const MAX_CONTINUATIONS = 2;
const MODEL = 'claude-sonnet-5';

// Caps how many existing catalog captions go into the prompt. The catalog
// has 114 albums as of 2026-08-07 (checked live) — comfortably under this
// cap, so every album is currently included; raise this if the catalog
// grows well past it (a truncated list has a real gap: an earlier live
// run capped at 80 would have silently excluded the alphabetically-last
// ~30% of albums from the "don't repeat these" list).
const MAX_AVOID_LIST_SIZE = 200;

// 2026-08-08: the "respond with ONLY a JSON object, no other text" instruction
// this used to end with is the suspected cause of a real grounding-gate
// failure (Round 2, theme "kawaii cottagecore frog": 15 real search queries
// but 0 cited URLs — see docs/genai-growth/IMAGE_GENERATION_PREFERENCES.md).
// Citation markup (assessGrounding() reads TextBlock.citations) typically
// attaches to prose that directly references a search result, not to a
// paraphrased summary crammed into JSON field values. Now asks for a short
// cited paragraph BEFORE the JSON instead — extractJson()'s regex already
// scans for a JSON object anywhere in the text, so this needs no parsing
// change. Not yet confirmed this actually fixes the gate (citation
// attachment is the model's call, not something forced by instruction) —
// next live detectTrend() run will show whether distinctCitedUrls improves.
export function buildPrompt(existingThemes: string[]): string {
  const avoidList = existingThemes.slice(0, MAX_AVOID_LIST_SIZE).join(', ');

  return `I run cross-stitch.com, a cross-stitch pattern catalog site. I want to grow the catalog by generating a new design around a theme that is genuinely trending RIGHT NOW specifically within the cross-stitch hobby community — not general home-decor or craft trends.

Search specifically within cross-stitch sources: cross-stitch-tagged Pinterest boards/pins, Etsy cross-stitch-pattern bestsellers or new-and-notable listings, r/CrossStitch discussion threads, and cross-stitch-specific Google Trends queries. Do not rely on general "trending in home decor" or "popular crafts" searches — the signal has to come from the cross-stitch niche itself.

Propose exactly ONE visual theme suitable for a cross-stitch pattern. It must be:
- A single clear subject (e.g. "a fox"), NOT an abstract concept and NOT a busy multi-subject scene — this needs to convert cleanly into a limited-color-palette image later, so simplicity matters more than novelty.
- Something NOT already well covered in my existing catalog. Here is a sample of my current catalog's album/category names, so you can avoid overlapping with them: ${avoidList}

Also research, from the same cross-stitch-specific sources, TWO more things about this theme:
- **Size**: what finished/pattern size is currently popular for this kind of subject in cross-stitch listings/patterns — small quick-stitch motifs, medium wall-art pieces, or large detailed portraits. Translate that into an approximate stitch-count size (width x height in stitches — typical range is roughly 40-250 per side; small quick projects are 40-90, medium wall art 90-160, large detailed pieces 160-250).
- **Color combination**: what color palette is currently popular for this kind of subject (e.g. muted autumn tones, bold primary colors, pastel kawaii palette) — describe the SUBJECT's own colors, not the background (the background must stay solid flat white regardless, see below — that is a fixed technical constraint of the conversion pipeline, unrelated to color trends).

After researching, first write a short paragraph (2-4 sentences) citing your actual sources with real URLs inline — e.g. "According to https://www.pinterest.com/... and https://www.etsy.com/listing/...". Do not skip this even though the JSON below restates the same findings — the citation step matters.

Then, on its own line after that paragraph, respond with a JSON object with exactly these fields (nothing after the JSON object):
{
  "theme": "short name for the theme, e.g. 'autumn fox'",
  "imagePrompt": "a one-paragraph image-generation prompt for a cross-stitch-ready SUBJECT PORTRAIT, not a scene: the subject alone, large, filling almost the entire frame, centered, on a SOLID FLAT WHITE background — explicitly say 'solid flat white background' in the prompt, and explicitly rule out anything that would break that flatness: no vignette, no gradient, no glow, no shadow, no circular badge or frame or border, no texture or grain, no ground/floor/grass/props of any kind. Describe only the subject itself — pose, colors (use the researched color combination below), style (e.g. bold clean dark outlines, flat kawaii illustration, no shading gradients on the background) — the way a die-cut sticker or a single embroidery-hoop motif would be composed, not an illustrated scene. No meta-commentary.",
  "signalSource": "which specific source(s) you actually searched and found this on, e.g. 'r/CrossStitch weekly finished-object thread, Aug 2026'",
  "reasoning": "one or two sentences on why you believe this is currently trending within cross-stitch specifically, citing what you found",
  "targetWidth": "approximate popular width in stitches, as a number, e.g. 100",
  "targetHeight": "approximate popular height in stitches, as a number, e.g. 100",
  "colorPalette": "short description of the popular color combination for this subject, e.g. 'warm autumn palette: burnt orange, cream, deep brown, soft yellow'"
}`;
}

export function extractJson(text: string): ParsedTrend | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (
      typeof parsed.theme === 'string' &&
      typeof parsed.imagePrompt === 'string' &&
      typeof parsed.signalSource === 'string' &&
      typeof parsed.reasoning === 'string' &&
      typeof parsed.targetWidth === 'number' &&
      typeof parsed.targetHeight === 'number' &&
      typeof parsed.colorPalette === 'string'
    ) {
      return parsed as ParsedTrend;
    }
    console.error('[trend-detection] parsed JSON missing expected fields:', parsed);
    return null;
  } catch (e) {
    console.error('[trend-detection] failed to parse JSON from response:', e);
    return null;
  }
}

// Guards against the "hallucinated trends" risk flagged in
// OPPORTUNITIES.md: the model can produce plausible-sounding prose about
// a "trend" without having actually searched for it. A `server_tool_use`
// block is Claude actually issuing a real web_search call (confirmed via
// automation/pinterest-agent/scripts/_diag_search_error.ts) — its
// presence is evidence real searches happened, not proof the theme is
// correct, but its ABSENCE is a clear signal not to trust the result.
export function hasRealWebSearchEvidence(content: Anthropic.ContentBlock[]): boolean {
  return content.some((block) => block.type === 'server_tool_use');
}

export interface GroundingCitation {
  url: string;
  title: string | null;
  citedText: string;
}

export interface GroundingAssessment {
  distinctQueries: number;
  distinctCitedUrls: number;
  citedDomains: string[];
  citations: GroundingCitation[];
  passesGate: boolean;
}

// Cross-stitch-relevant domains per OPPORTUNITIES.md's Opportunity 9
// "Trend detection" source restriction — a citation from outside this list
// is a signal the niche-source instruction in buildPrompt() didn't actually
// bite, even if the model did search for real.
const ALLOWED_CITATION_DOMAINS = ['pinterest.com', 'etsy.com', 'reddit.com', 'trends.google.com'];

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isAllowedDomain(hostname: string): boolean {
  return ALLOWED_CITATION_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

/**
 * Deterministic, zero-marginal-cost grounding check — no extra AI call.
 * hasRealWebSearchEvidence() above only proves *a* search happened; this
 * reads the real search queries (ServerToolUseBlock.input) and the real
 * citations Claude's final answer actually leaned on
 * (CitationsWebSearchResultLocation on TextBlock.citations) that the SDK
 * already returns today but nothing previously read. See OPPORTUNITIES.md
 * Opportunity 9 "Grounding" section for the full design rationale.
 *
 * passesGate is a provisional threshold (>=2 distinct cited URLs, at least
 * one from an allowed domain) — callers should treat a failing gate as
 * "flag for manual review," not an automatic hard reject; no real-world
 * calibration data exists yet.
 */
export function assessGrounding(content: Anthropic.ContentBlock[]): GroundingAssessment {
  const queries = new Set<string>();
  for (const block of content) {
    if (block.type === 'server_tool_use' && block.name === 'web_search') {
      const input = block.input as { query?: string } | undefined;
      if (input?.query) queries.add(input.query);
    }
  }

  const citationsByUrl = new Map<string, GroundingCitation>();
  for (const block of content) {
    if (block.type !== 'text') continue;
    for (const citation of block.citations ?? []) {
      if (citation.type !== 'web_search_result_location') continue;
      if (!citationsByUrl.has(citation.url)) {
        citationsByUrl.set(citation.url, {
          url: citation.url,
          title: citation.title,
          citedText: citation.cited_text,
        });
      }
    }
  }

  const citations = [...citationsByUrl.values()];
  const citedDomains = [...new Set(
    citations.map((c) => hostnameOf(c.url)).filter((h): h is string => !!h),
  )];

  return {
    distinctQueries: queries.size,
    distinctCitedUrls: citations.length,
    citedDomains,
    citations,
    passesGate: citations.length >= 2 && citedDomains.some(isAllowedDomain),
  };
}

/** Runs the trend-detection research call. Returns null if the API key is
 * missing, the model didn't actually search the web, or the response
 * couldn't be parsed as the expected JSON shape — callers should treat
 * null as "try again later," not retry-loop automatically (each attempt
 * has real web_search billing, see MAX_SEARCH_USES above).
 */
export async function detectTrend(): Promise<TrendDetectionResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[trend-detection] ANTHROPIC_API_KEY not set');
    return null;
  }

  const albums = await getAllAlbumCaptions();
  const existingThemes = (albums ?? []).map((a) => a.Caption);

  const client = new Anthropic({ apiKey });
  const tools: Anthropic.Tool[] = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCH_USES } as unknown as Anthropic.Tool,
  ];
  let messages: Anthropic.MessageParam[] = [{ role: 'user', content: buildPrompt(existingThemes) }];

  // Accumulated across every response in the pause_turn loop, not just the
  // final one — search calls and their citations can land in an earlier
  // continuation than the one that finally emits the JSON answer, so both
  // the search-evidence check and the grounding assessment need the full
  // conversation's content, not just response.content from the last turn.
  const allContent: Anthropic.ContentBlock[] = [];

  let response = await client.messages.create({ model: MODEL, max_tokens: 2000, tools, messages });
  allContent.push(...response.content);

  let continuations = 0;
  while (response.stop_reason === 'pause_turn' && continuations < MAX_CONTINUATIONS) {
    messages = [...messages, { role: 'assistant', content: response.content }];
    response = await client.messages.create({ model: MODEL, max_tokens: 2000, tools, messages });
    allContent.push(...response.content);
    continuations++;
  }

  if (!hasRealWebSearchEvidence(allContent)) {
    console.error('[trend-detection] no server_tool_use (real web_search) blocks in the response — refusing to trust an ungrounded result');
    return null;
  }

  // 2026-08-08: was `response.content` (the LAST turn only) — a real bug,
  // inconsistent with the accumulated-allContent principle this file
  // already applies to hasRealWebSearchEvidence()/assessGrounding() just
  // above. If the model wrote its final JSON answer on an earlier
  // continuation and the LAST turn ended with no text of its own (e.g.
  // pure tool_use, or hit MAX_CONTINUATIONS mid-flow), the real answer
  // existed in allContent but this discarded it — confirmed as the cause
  // of two consecutive real "empty text response" failures the same day,
  // right after buildPrompt() started asking for more output (a cited
  // paragraph before the JSON), which likely made hitting this edge case
  // more common by needing an extra turn more often.
  const text = allContent
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n');

  if (!text.trim()) {
    console.error('[trend-detection] empty text response');
    return null;
  }

  const parsed = extractJson(text);
  if (!parsed) return null;

  const grounding = assessGrounding(allContent);
  if (!grounding.passesGate) {
    console.warn(
      '[trend-detection] grounding gate failed (flag for manual review, not an automatic reject):',
      { distinctCitedUrls: grounding.distinctCitedUrls, citedDomains: grounding.citedDomains },
    );
  }

  return { ...parsed, grounding };
}
