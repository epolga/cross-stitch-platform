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
import { getDesignById, getAlbumCaption } from './data-access';
import {
  findNearestTextMatch,
  findNearestAlbumMatch,
  backfillMissingEmbeddings,
  backfillMissingAlbumEmbeddings,
} from './semantic-search';

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

// 2026-08-09: was a hard reject (returned null, threw the whole result
// away) — Olga's call to soften it back to informational, same day it was
// added. Reasoning: the check is text-only (caption+description
// embeddings), so it can't tell whether a textually-similar theme would
// actually render as a visually distinct design — a real risk of
// discarding a genuinely different design over a caption-similarity
// false positive. Surfaced in the result instead, same pattern as
// `grounding`, so a human (Olga, reviewing the draft) makes the actual
// accept/reject call with the real generated image in front of her,
// not the model or this code guessing blind from text alone.
export interface DuplicateCheckResult {
  flagged: boolean;
  similarity: number | null; // null only if the check itself failed (non-fatal)
  matchedDesignId?: number;
  matchedCaption?: string;
}

export interface TrendDetectionResult extends ParsedTrend {
  grounding: GroundingAssessment;
  duplicateCheck: DuplicateCheckResult;
}

// Same cap and reasoning as aiToolsScan.ts: max_uses bounds the search
// count per request (it's a per-request cap, not a time-windowed rate
// limit) — 15 was the value that stopped aiToolsScan's 6-angle prompt
// from hitting max_uses_exceeded. This prompt asks for one theme instead
// of six research angles, so it very likely needs far fewer searches in
// practice, but the ceiling itself is cheap to leave generous.
const MAX_SEARCH_USES = 15;
// 2026-08-09: was 2 — bumped when search_catalog (a client-side tool, see
// below) started sharing this same continuation budget with pause_turn
// (web_search). Each search_catalog round-trip now costs one continuation
// too, and the model may reasonably want to check 1-2 candidate themes
// against the catalog in addition to its research turns — 2 was tuned
// only against the old web_search-only flow and left no room for that.
const MAX_CONTINUATIONS = 4;
const MODEL = 'claude-sonnet-5';
// 2026-08-09 (Olga's ask, ADR-009's "Revisit When" condition triggered
// for real): search_catalog alone wasn't enough — a live run proposed
// "kawaii capybara" again with a real 0.6265 similarity against the
// actual "Capybara" design already in the catalog (well above the ~0.37
// noise floor measured for a genuine non-match), meaning either the
// model never called the tool for this theme, or called it and didn't
// treat a clearly-duplicate score as disqualifying. detectTrend() now
// does its own final design-level check on the model's SETTLED theme
// before returning it.
// Calibration is provisional (n=2): 0.6265 for a confirmed real
// duplicate (capybara), ~0.37 for a confirmed real non-match (an
// unrelated "Beaver" design was the nearest neighbor for a genuinely new
// theme) — 0.5 sits with margin on both sides of that gap. Only applied
// to the DESIGN-level check for now, not album-level: the two aren't on
// the same scale (a real album-level match scored 0.754, but a
// definitely-not-a-match album-level nearest-neighbor scored 0.643 —
// higher than the design-level real-duplicate score), and there isn't
// enough real album-level data yet to trust a threshold there.
// 2026-08-09, same day, softened back from a hard reject to informational
// — Olga's call: this check is text-only (caption+description
// embeddings), so it can't tell whether a caption-similar theme would
// actually render as a visually distinct design. A hard reject risked
// silently discarding a genuinely new design over a false positive, with
// no way for a human to catch it. Now surfaced as `duplicateCheck` on the
// returned result (see DuplicateCheckResult) instead of blocking —
// Olga reviews the real generated image before deciding, not this
// text-only heuristic.
const DESIGN_DUPLICATE_THRESHOLD = 0.5;
// 2026-08-08: was 2000 — confirmed via a real failure (extractJson's new
// "no JSON found" logging showed the response cut off mid-sentence, still
// inside the cited paragraph, never reaching the JSON at all) that this
// wasn't enough headroom once buildPrompt() started asking for a cited
// paragraph before the JSON (added the same day, for the grounding-gate
// fix) — a single turn's tool_use blocks (each real search call) plus
// that prose plus the JSON can outrun 2000 tokens. Bumped with margin;
// not scientifically tuned, revisit if truncation recurs.
const MAX_TOKENS = 4096;

// 2026-08-09: replaced the old text avoid-list approach (dump every unique
// design caption into the prompt, ~2398 of them, and trust the model to
// visually spot overlap) with a client-side tool the model calls on demand
// instead. The text-dump version had a real dedup gap: detectTrend()
// proposed "frog" three times in one session (one already published as
// "Kawaii Cottagecore Frog") — first because the list was ALBUM captions
// (114 of them, e.g. "Children") not individual design names (fixed
// 2026-08-08), and more fundamentally because exact-string comparison
// can't catch a near-duplicate like "kawaii green frog" against "Kawaii
// Cottagecore Frog" — no shared substring, but semantically the same
// subject. search_catalog runs a real embedding-similarity lookup
// (findNearestTextMatch(), semantic-search.ts) against the catalog's
// precomputed Titan text embeddings, so it judges by meaning, not
// spelling, and the model can check as many candidate themes as it likes
// mid-reasoning instead of eyeballing one static list once.
const SEARCH_CATALOG_TOOL: Anthropic.Tool = {
  name: 'search_catalog',
  description:
    "Check whether a candidate cross-stitch design theme already closely matches an existing design OR an existing whole album in my catalog. This uses semantic similarity, not exact text matching, so it catches near-duplicates a literal name comparison would miss (e.g. 'kawaii green frog' vs an existing 'Kawaii Cottagecore Frog' design). The album-level check matters separately from the design-level one — a theme can score low against every individual (often terse/generic, e.g. 'Butterfly 1') design caption while still clearly overlapping with an entire dedicated album (e.g. a 'Butterflies' album with 73 designs). Call this for any theme you're seriously considering before finalizing your answer, and call it again if you switch to a different candidate theme.",
  input_schema: {
    type: 'object',
    properties: {
      candidateTheme: {
        type: 'string',
        description: "The theme you're currently considering, e.g. 'autumn hedgehog'",
      },
    },
    required: ['candidateTheme'],
  },
};

// Executes search_catalog when the model calls it. Non-fatal by design —
// same "never block the pipeline over a helper AI/lookup failure" pattern
// as design-seo-description.ts: if the embedding call or vector load
// fails, tell the model to fall back to its own judgment rather than
// throwing out of detectTrend() entirely.
//
// The similarity threshold for "counts as a duplicate" is NOT enforced
// here — this returns the raw score and lets the model judge, since no
// real-world calibration data exists yet for what score actually means
// "same subject" for Titan's text embeddings. Revisit once a few real
// runs show what scores genuine near-duplicates (like the frog case)
// versus genuinely distinct themes actually produce.
//
// 2026-08-09: added the album-level check (Olga's ask, after checking
// Album 59 "Butterflies" — 73 designs, individually captioned "Butterfly
// N", terse enough that a candidate theme's embedding might not score
// strongly against any ONE of them even though the subject is clearly
// already a whole dedicated album). Runs both checks and reports both —
// deliberately doesn't pick one signal over the other or combine them
// into a single score, since design-level and album-level similarity
// aren't directly comparable numbers.
async function runSearchCatalogTool(candidateTheme: string): Promise<string> {
  const parts: string[] = [];
  try {
    const match = await findNearestTextMatch(candidateTheme);
    if (match) {
      const design = await getDesignById(match.designId);
      const caption = design?.Caption ?? `design #${match.designId}`;
      parts.push(`Closest existing DESIGN: "${caption}" (similarity ${match.similarity.toFixed(3)})`);
    } else {
      parts.push('No existing designs found to compare against.');
    }
  } catch (e) {
    console.error('[trend-detection] search_catalog design-level check failed:', e);
    parts.push('Design-level catalog search is temporarily unavailable.');
  }
  try {
    const albumMatch = await findNearestAlbumMatch(candidateTheme);
    if (albumMatch) {
      const caption = (await getAlbumCaption(albumMatch.albumId)) ?? `album #${albumMatch.albumId}`;
      parts.push(`Closest existing ALBUM: "${caption}" (similarity ${albumMatch.similarity.toFixed(3)})`);
    } else {
      parts.push('No existing albums found to compare against.');
    }
  } catch (e) {
    console.error('[trend-detection] search_catalog album-level check failed:', e);
    parts.push('Album-level catalog search is temporarily unavailable.');
  }
  parts.push('Higher similarity means more similar — treat anything that reads as clearly the same subject as already covered, whether the match came from the design-level or album-level check.');
  return parts.join(' ');
}

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
export function buildPrompt(): string {
  return `I run cross-stitch.com, a cross-stitch pattern catalog site. I want to grow the catalog by generating a new design around a theme that is genuinely trending RIGHT NOW specifically within the cross-stitch hobby community — not general home-decor or craft trends.

Search specifically within cross-stitch sources: cross-stitch-tagged Pinterest boards/pins, Etsy cross-stitch-pattern bestsellers or new-and-notable listings, r/CrossStitch discussion threads, and cross-stitch-specific Google Trends queries. Do not rely on general "trending in home decor" or "popular crafts" searches — the signal has to come from the cross-stitch niche itself.

Propose exactly ONE visual theme suitable for a cross-stitch pattern. It must be:
- A single clear subject (e.g. "a fox"), NOT an abstract concept and NOT a busy multi-subject scene — this needs to convert cleanly into a limited-color-palette image later, so simplicity matters more than novelty.
- Something NOT already well covered in my existing catalog. Use the search_catalog tool to check any candidate theme against my catalog before settling on it — it tells you the closest existing match by meaning, not just by name, so a differently-worded near-duplicate still counts as already covered. Check as many candidates as you need to find one that's genuinely new.

Also research, from the same cross-stitch-specific sources, TWO more things about this theme:
- **Size**: what finished/pattern size is currently popular for this kind of subject in cross-stitch listings/patterns — small quick-stitch motifs, medium wall-art pieces, or large detailed portraits. Translate that into an approximate stitch-count size (width x height in stitches — typical range is roughly 40-250 per side; small quick projects are 40-90, medium wall art 90-160, large detailed pieces 160-250).
- **Color combination**: what color palette is currently popular for this kind of subject (e.g. muted autumn tones, bold primary colors, pastel kawaii palette) — describe the SUBJECT's own colors, not the background (the background must stay solid flat white regardless, see below — that is a fixed technical constraint of the conversion pipeline, unrelated to color trends). Whatever the popular palette turns out to be, lean toward its brightest/most vivid, saturated version rather than a muted or pastel-washed-out one — vivid colors read better once converted to a limited-color cross-stitch chart.

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

// 2026-08-09: found via a real live run — the model returned
// `"targetWidth": "70"` (a quoted numeric string), not `70`, despite
// buildPrompt() asking for "a number". A strict `typeof === 'number'`
// check rejected an otherwise-complete, well-grounded response (real
// theme, real cited sources) over a formatting slip unrelated to
// anything the caller actually cares about. Accepts either shape and
// normalizes to a real number either way.
function coerceNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function extractJson(text: string): ParsedTrend | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    // 2026-08-08: this branch used to return null silently — a real
    // "no JSON object anywhere in the text" failure was previously
    // indistinguishable from every other null-return path, since nothing
    // here logged what actually happened. Log a snippet so a real
    // failure (e.g. the model ran out of turns/tokens mid cited-paragraph,
    // before ever reaching the JSON) is diagnosable instead of silent.
    console.error('[trend-detection] no JSON object found in response text. Length:', text.length, 'snippet:', text.slice(-500));
    return null;
  }
  try {
    const parsed = JSON.parse(match[0]);
    const targetWidth = coerceNumber(parsed.targetWidth);
    const targetHeight = coerceNumber(parsed.targetHeight);
    if (
      typeof parsed.theme === 'string' &&
      typeof parsed.imagePrompt === 'string' &&
      typeof parsed.signalSource === 'string' &&
      typeof parsed.reasoning === 'string' &&
      targetWidth !== undefined &&
      targetHeight !== undefined &&
      typeof parsed.colorPalette === 'string'
    ) {
      return { ...parsed, targetWidth, targetHeight } as ParsedTrend;
    }
    // 2026-08-09: this branch only ever logged the (partial) parsed
    // object, not the raw match — indistinguishable from "the model wrote
    // a genuinely different shape" vs. "generation got cut off mid-JSON
    // and the regex's greedy match happened to still find a `}` later in
    // the text, producing a parseable but truncated object." Found live:
    // a response with only `theme`/`imagePrompt` present, nothing else —
    // consistent with hitting MAX_TOKENS before finishing, now more
    // likely since search_catalog's extra turns/tool_result content grow
    // the conversation. Log length + raw match so a future occurrence is
    // diagnosable instead of just "some fields were missing."
    console.error(
      '[trend-detection] parsed JSON missing expected fields:',
      parsed,
      '| full text length:', text.length,
      '| matched JSON length:', match[0].length,
      '| matched JSON snippet (last 500 chars):', match[0].slice(-500),
    );
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

  // 2026-08-09: run every time, not a one-off manual fix (Olga's ask) —
  // search_catalog is only useful if the embedding it searches against
  // actually exists. Cheap when nothing's missing (just the index load
  // findNearestTextMatch() needs anyway); only costs real Bedrock calls
  // when the catalog has genuinely grown since the last run. Non-fatal:
  // a backfill failure shouldn't block trend detection itself, since
  // search_catalog still degrades gracefully (runSearchCatalogTool()'s
  // own try/catch) against whatever the index already has.
  try {
    const backfill = await backfillMissingEmbeddings();
    if (backfill.added > 0 || backfill.errors > 0) {
      console.log(`[trend-detection] catalog embedding backfill: +${backfill.added}, ${backfill.errors} errors`);
    }
  } catch (e) {
    console.error('[trend-detection] catalog embedding backfill failed, proceeding with existing index:', e);
  }
  // 2026-08-09: same reasoning as the design backfill above, for the new
  // album-level index (Olga's ask, adding album-level search_catalog
  // checking) — only 114 albums, so even a from-scratch first run is
  // trivially cheap.
  try {
    const albumBackfill = await backfillMissingAlbumEmbeddings();
    if (albumBackfill.added > 0 || albumBackfill.errors > 0) {
      console.log(`[trend-detection] album embedding backfill: +${albumBackfill.added}, ${albumBackfill.errors} errors`);
    }
  } catch (e) {
    console.error('[trend-detection] album embedding backfill failed, proceeding with existing index:', e);
  }

  // 2026-08-08: explicit timeout, shorter than the SDK's own 10-minute
  // default (confirmed in client.d.ts — and retried on timeout by
  // default, so worst case is even longer). This is a manually-triggered,
  // interactive research call, not a background batch job — a single
  // API call taking anywhere near 10 minutes means something is actually
  // wrong, not just a slow-but-fine response. Found for real: killed a
  // run stuck at ~9 minutes with near-zero CPU growth rather than wait
  // out the SDK default.
  const client = new Anthropic({ apiKey, timeout: 120_000 });
  const tools: Anthropic.Tool[] = [
    // 2026-08-09: allowed_callers explicitly forced to ['direct'] — the
    // default for web_search_20260209 is ['code_execution_20260120'],
    // meaning searches route through a code-execution intermediary
    // instead of the model calling the tool directly. Confirmed via
    // Anthropic's own docs: citations are "always enabled" for web_search
    // (no missing-flag explanation for our real, repeated
    // distinctCitedUrls: 0 across every live run so far), and the
    // container_id 400 error found the same day is itself evidence of
    // code-execution-backed tool routing. Not confirmed yet whether this
    // is the actual cause of the citation gap (undocumented), but it's
    // the one real lever available to test the hypothesis — verify via
    // the next live run whether distinctCitedUrls improves.
    { type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCH_USES, allowed_callers: ['direct'] } as unknown as Anthropic.Tool,
    SEARCH_CATALOG_TOOL,
  ];
  let messages: Anthropic.MessageParam[] = [{ role: 'user', content: buildPrompt() }];
  let containerId: string | undefined;

  // Cumulative across every attempt AND every continuation within an
  // attempt — used only for hasRealWebSearchEvidence() (a monotonic "was
  // there ever a real search" check, safe to accumulate) and the
  // MAX_GROUNDING_ATTEMPTS retry's continued context. NOT used for text/
  // JSON extraction or grounding — see attemptContent below for why.
  const allContent: Anthropic.ContentBlock[] = [];

  // 2026-08-09 (Olga's ask): grounding used to only ever warn, never
  // retry — a thin-sourced answer (e.g. 1 citation, gate needs >=2) was
  // still accepted as-is. Now gives the model one real chance to search
  // more specifically and re-cite before accepting, instead of settling
  // for the first pass. Bounded at 2 total attempts (not unbounded) since
  // each attempt carries real web_search billing.
  const MAX_GROUNDING_ATTEMPTS = 2;
  let parsed: ParsedTrend | null = null;
  let grounding: GroundingAssessment | null = null;

  for (let attempt = 1; attempt <= MAX_GROUNDING_ATTEMPTS; attempt++) {
    // This attempt's own turns only — kept separate from allContent so a
    // retry's extraction/grounding reflects THIS attempt's final answer,
    // not a garbled concatenation of two attempts' text blocks (extractJson's
    // regex is greedy from the first `{` to the last `}` in the string —
    // two JSON objects back to back would parse as one malformed blob).
    const attemptContent: Anthropic.ContentBlock[] = [];

    let response = await client.messages.create({ model: MODEL, max_tokens: MAX_TOKENS, tools, messages, container: containerId });
    allContent.push(...response.content);
    attemptContent.push(...response.content);
    // 2026-08-09: found via a real live failure the first time search_catalog
    // (a client tool) coexisted with web_search's pause_turn continuations in
    // the same run: "container_id is required when there are pending tool
    // uses generated by code execution with tools" (400 error). The SDK's
    // Message type documents `container` as "for the code execution tool,"
    // but it's returned whenever the server needs one to keep a multi-turn
    // tool-use conversation coherent — every continuation must echo the same
    // container id back, or the server can't resolve the pending tool uses
    // from the previous turn.
    containerId = response.container?.id ?? containerId;

    let continuations = 0;
    while (
      (response.stop_reason === 'pause_turn' || response.stop_reason === 'tool_use') &&
      continuations < MAX_CONTINUATIONS
    ) {
      messages = [...messages, { role: 'assistant', content: response.content }];

      // pause_turn (web_search) needs nothing from us — Anthropic already
      // executed it server-side. tool_use (search_catalog) is a CLIENT tool:
      // we have to actually run it ourselves and hand the result back as a
      // tool_result message before the model can continue.
      if (response.stop_reason === 'tool_use') {
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== 'tool_use' || block.name !== 'search_catalog') continue;
          const input = block.input as { candidateTheme?: string };
          // 2026-08-09: found live — "kawaii capybara" was proposed again
          // (real similarity 0.6265 against the actual "Capybara" design,
          // well above the noise floor of ~0.37 for a genuine non-match)
          // with no way to tell from the logs whether search_catalog was
          // ever called for it at all, or was called and the model just
          // didn't treat the result as disqualifying. This log is the
          // direct evidence that was missing — check it on the next run
          // that recurs a theme.
          console.log(`[trend-detection] search_catalog called with candidateTheme: "${input?.candidateTheme}"`);
          const resultText = input?.candidateTheme
            ? await runSearchCatalogTool(input.candidateTheme)
            : 'Missing candidateTheme argument.';
          console.log(`[trend-detection] search_catalog result: ${resultText}`);
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultText });
        }
        if (toolResults.length > 0) {
          messages = [...messages, { role: 'user', content: toolResults }];
        }
      }

      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        tools,
        messages,
        container: containerId,
      });
      allContent.push(...response.content);
      attemptContent.push(...response.content);
      containerId = response.container?.id ?? containerId;
      continuations++;
    }
    if (response.stop_reason === 'pause_turn' || response.stop_reason === 'tool_use') {
      // Loop exited only because MAX_CONTINUATIONS was hit, not because the
      // model naturally finished — the conversation was still mid-flow
      // (more searches or catalog checks queued, or mid-sentence). Temporary
      // diagnostic added 2026-08-08 after two real truncated-response
      // failures survived a max_tokens bump — confirms whether the real
      // bottleneck is turn count (MAX_CONTINUATIONS) rather than per-turn
      // token budget.
      console.warn(`[trend-detection] attempt ${attempt}: exited the continuation loop while still ${response.stop_reason} — MAX_CONTINUATIONS reached before the model naturally finished`);
    }
    // Carries this attempt's final turn into the shared history so a
    // retry (if any) has full context of what was already said/found —
    // it's asked to improve on this, not start over blind.
    messages = [...messages, { role: 'assistant', content: response.content }];

    // 2026-08-08: was `response.content` (the LAST turn only) — a real bug,
    // inconsistent with the accumulated-content principle this file
    // already applies elsewhere. If the model wrote its final JSON answer
    // on an earlier continuation and the LAST turn ended with no text of
    // its own (e.g. pure tool_use, or hit MAX_CONTINUATIONS mid-flow), the
    // real answer existed but got discarded — confirmed as the cause of
    // two consecutive real "empty text response" failures. Scoped to
    // attemptContent (not the cumulative allContent) since 2026-08-09's
    // grounding-retry change — see attemptContent's comment above.
    const attemptText = attemptContent
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n\n');

    if (!attemptText.trim()) {
      console.error(`[trend-detection] attempt ${attempt}: empty text response`);
      continue;
    }

    const attemptParsed = extractJson(attemptText);
    if (!attemptParsed) continue;

    parsed = attemptParsed;
    grounding = assessGrounding(attemptContent);

    if (grounding.passesGate || attempt === MAX_GROUNDING_ATTEMPTS) break;

    console.warn(
      `[trend-detection] attempt ${attempt}: grounding gate failed, asking the model to search more and re-cite before accepting:`,
      { distinctCitedUrls: grounding.distinctCitedUrls, citedDomains: grounding.citedDomains },
    );
    messages = [...messages, {
      role: 'user',
      content: `Your sourcing was too thin (${grounding.distinctCitedUrls} distinct cited URL(s); I need at least 2, with at least one from pinterest.com, etsy.com, reddit.com, or trends.google.com). Please search more specifically for stronger evidence that "${parsed.theme}" is genuinely trending in cross-stitch right now, then write a new cited paragraph and JSON answer with better sourcing — it can be the same theme with better evidence, or a different one if you can't find enough support for this one.`,
    }];
  }

  if (!parsed || !grounding) {
    console.error('[trend-detection] no valid JSON answer across all attempts');
    return null;
  }

  if (!hasRealWebSearchEvidence(allContent)) {
    console.error('[trend-detection] no server_tool_use (real web_search) blocks in the response — refusing to trust an ungrounded result');
    return null;
  }

  // Informational, not a hard reject — see DuplicateCheckResult's comment
  // above for why (Olga's call, 2026-08-09: a text-only check can't tell
  // whether a caption-similar theme would actually render as a visually
  // distinct design). Runs on the model's final, settled theme
  // (parsed.theme), independent of whether/how the model used
  // search_catalog mid-reasoning.
  let duplicateCheck: DuplicateCheckResult = { flagged: false, similarity: null };
  try {
    const finalCheck = await findNearestTextMatch(parsed.theme);
    if (finalCheck) {
      const flagged = finalCheck.similarity >= DESIGN_DUPLICATE_THRESHOLD;
      duplicateCheck = { flagged, similarity: finalCheck.similarity, matchedDesignId: finalCheck.designId };
      if (flagged) {
        const existing = await getDesignById(finalCheck.designId);
        duplicateCheck.matchedCaption = existing?.Caption;
        console.warn(
          `[trend-detection] flagged (not rejected) — final theme "${parsed.theme}" scores ${finalCheck.similarity.toFixed(4)} against existing design "${existing?.Caption ?? finalCheck.designId}" (>= threshold ${DESIGN_DUPLICATE_THRESHOLD}). Review the generated image before deciding — text similarity alone doesn't mean the picture will look the same.`,
        );
      }
    }
  } catch (e) {
    // Non-fatal — same "don't block the pipeline over a helper check
    // failing" pattern as runSearchCatalogTool(). duplicateCheck stays at
    // its default (flagged: false, similarity: null) so the caller can
    // tell "checked, looks fine" apart from "the check itself failed."
    console.error('[trend-detection] final duplicate check failed, proceeding without it:', e);
  }

  if (!grounding.passesGate) {
    console.warn(
      '[trend-detection] grounding gate still failing after all attempts (flag for manual review, not an automatic reject):',
      { distinctCitedUrls: grounding.distinctCitedUrls, citedDomains: grounding.citedDomains },
    );
  }

  return { ...parsed, grounding, duplicateCheck };
}
