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

export interface TrendDetectionResult {
  theme: string;
  imagePrompt: string;
  signalSource: string;
  reasoning: string;
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

export function buildPrompt(existingThemes: string[]): string {
  const avoidList = existingThemes.slice(0, MAX_AVOID_LIST_SIZE).join(', ');

  return `I run cross-stitch.com, a cross-stitch pattern catalog site. I want to grow the catalog by generating a new design around a theme that is genuinely trending RIGHT NOW specifically within the cross-stitch hobby community — not general home-decor or craft trends.

Search specifically within cross-stitch sources: cross-stitch-tagged Pinterest boards/pins, Etsy cross-stitch-pattern bestsellers or new-and-notable listings, r/CrossStitch discussion threads, and cross-stitch-specific Google Trends queries. Do not rely on general "trending in home decor" or "popular crafts" searches — the signal has to come from the cross-stitch niche itself.

Propose exactly ONE visual theme suitable for a cross-stitch pattern. It must be:
- A single clear subject (e.g. "a fox"), NOT an abstract concept and NOT a busy multi-subject scene — this needs to convert cleanly into a limited-color-palette image later, so simplicity matters more than novelty.
- Something NOT already well covered in my existing catalog. Here is a sample of my current catalog's album/category names, so you can avoid overlapping with them: ${avoidList}

After researching, respond with ONLY a JSON object with exactly these fields (no other text before or after it):
{
  "theme": "short name for the theme, e.g. 'autumn fox'",
  "imagePrompt": "a one-paragraph image-generation prompt for a cross-stitch-ready SUBJECT PORTRAIT, not a scene: the subject alone, large, filling almost the entire frame, centered, on a SOLID FLAT WHITE background — explicitly say 'solid flat white background' in the prompt, and explicitly rule out anything that would break that flatness: no vignette, no gradient, no glow, no shadow, no circular badge or frame or border, no texture or grain, no ground/floor/grass/props of any kind. Describe only the subject itself — pose, colors, style (e.g. bold clean dark outlines, flat kawaii illustration, no shading gradients on the background) — the way a die-cut sticker or a single embroidery-hoop motif would be composed, not an illustrated scene. No meta-commentary.",
  "signalSource": "which specific source(s) you actually searched and found this on, e.g. 'r/CrossStitch weekly finished-object thread, Aug 2026'",
  "reasoning": "one or two sentences on why you believe this is currently trending within cross-stitch specifically, citing what you found"
}`;
}

export function extractJson(text: string): TrendDetectionResult | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (
      typeof parsed.theme === 'string' &&
      typeof parsed.imagePrompt === 'string' &&
      typeof parsed.signalSource === 'string' &&
      typeof parsed.reasoning === 'string'
    ) {
      return parsed as TrendDetectionResult;
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

  let response = await client.messages.create({ model: MODEL, max_tokens: 2000, tools, messages });
  let sawRealSearch = hasRealWebSearchEvidence(response.content);

  let continuations = 0;
  while (response.stop_reason === 'pause_turn' && continuations < MAX_CONTINUATIONS) {
    messages = [...messages, { role: 'assistant', content: response.content }];
    response = await client.messages.create({ model: MODEL, max_tokens: 2000, tools, messages });
    sawRealSearch = sawRealSearch || hasRealWebSearchEvidence(response.content);
    continuations++;
  }

  if (!sawRealSearch) {
    console.error('[trend-detection] no server_tool_use (real web_search) blocks in the response — refusing to trust an ungrounded result');
    return null;
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n');

  if (!text.trim()) {
    console.error('[trend-detection] empty text response');
    return null;
  }

  return extractJson(text);
}
