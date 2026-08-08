# Image Generation Preferences — Track 2 (Opportunity 9)

Accumulates Olga's real preference signal comparing image-generation
providers/settings for Track 2's design-generation pipeline. This is the
in-context-learning preference document described in `OPPORTUNITIES.md`
Opportunity 9 step 5 — a plain document a human can read and edit, fed
back into future generation prompts, not model fine-tuning. Started
2026-08-07, one round in (open-ended exploration, per Olga's own framing
— "quite a few" comparisons expected, not a one-off test).

## Running score

- **OpenAI (gpt-image-1): 2**
- **Stability AI (stable-image-core): 0**

## Providers in play

- `generateImageStability()` — Stability AI direct REST API
  (api.stability.ai, not Bedrock — see `image-generation.ts`'s file
  header for why Bedrock isn't viable for either provider right now).
- `generateImageOpenAI()` — OpenAI Images API (`gpt-image-1`).
- `removeBackgroundStability()` — Stability's dedicated background-removal
  tool, tried as a post-processing fix when prompt-level "no background"
  instructions were ignored by both generators (see Round 1).

## Round 1 — 2026-08-07, theme: "capybara" (from the first real `detectTrend()` run)

**Prompt evolution this round** (all in `web/src/lib/trend-detection.ts`'s
`buildPrompt()` / the manual test-script prompt, same wording for both
providers each time):
1. First attempt: scene-style prompt (capybara floating among lily pads/
   lotus flowers) — Olga's feedback: subject too small, no scene should
   exist at all for a cross-stitch source image.
2. Rewrote to a "subject portrait" style (large, centered, on a plain
   background) — both providers still added an unwanted background
   treatment (Stability: circular badge frame; OpenAI: dark vignette/glow).
3. Tightened further with explicit negations ("no vignette, no badge, no
   frame, no texture") — **both providers ignored the negations almost
   entirely**, same treatments recurred. Concluded prompt-level negation
   is unreliable for this (a known diffusion-model failure mode — see
   `image-generation.ts`'s comment on `removeBackgroundStability`).
4. Tried a different fix: `removeBackgroundStability()` as a dedicated
   post-processing step instead of fighting the prompt further.
   - On the Stability image: cleanly removed the outer square,
     **left the circular badge intact** (border + subject read as one
     connected foreground shape to the segmentation model).
   - On the OpenAI image: cleanly removed the vignette entirely, leaving
     just the capybara — a genuine flat "die-cut sticker" result.

**Olga's verdict:** prefers the **original OpenAI image, before background
removal** (i.e. the version WITH the dark vignette/glow) over all three
other variants (Stability raw/badge, Stability background-removed,
OpenAI background-removed). Scored this round **OpenAI +1**.

**Why (Olga's answer, asked directly):** "Более чёткая картинка и сразу
без фона" — sharper/crisper image, and reads as background-free right
out of the box, no extra removal step needed. So the win wasn't "likes
vignettes" specifically — it's **(1) image sharpness/crispness** and
**(2) not needing a separate background-removal pass to look clean**.
Stability's badge version needed the extra `removeBackgroundStability()`
step and even then kept a border/frame; OpenAI's raw output already read
as "no background" to her without that step. Track this as the real
criterion for future rounds, not "OpenAI wins" as a brand preference —
if Stability ever produces a sharp, backgroundless-looking result
out of the box, that should score too.

**Caution against over-generalizing from n=1:** this is one theme, one
prompt, one round. Not yet safe to conclude "OpenAI > Stability" as a
general rule, "vignette backgrounds are good for cross-stitch conversion"
(this specific preference arguably works against the original "clean
color regions" conversion goal — worth revisiting once real
`pattern-converter.ts` runs exist to check), or anything about
Stability's badge style specifically being worse. More rounds needed
before drawing a real conclusion.

## Round 2 — 2026-08-08, theme: "kawaii cottagecore frog"

First real end-to-end run of the whole updated pipeline: `detectTrend()`
(with the new targetWidth/targetHeight/colorPalette research, added
2026-08-08) → `pickStabilityAspectRatio()`/`pickOpenAiSize()` → both
providers. Real `detectTrend()` output: `targetWidth: 105, targetHeight:
100` (colorPalette: "kawaii cottagecore palette: fresh grass green (body),
soft cream/off-white (belly), gentle pastel pink (cheek blush)..."). Near-
square, so both pickers correctly chose 1:1/1024x1024 — confirms the
picker logic runs against real research output, but this particular theme
didn't exercise a genuinely non-square ratio.

**Separate finding, same run:** the grounding gate failed
(`distinctCitedUrls: 0` despite 15 real search queries) — the model
searched for real (Etsy/Pinterest sources named in `signalSource`) but its
final answer's citations weren't extracted by `assessGrounding()`. First
real (not synthetic-test) case of this gate firing. Per its designed
behavior this is a flag for manual review, not an automatic reject — the
theme was still returned and used.

**Same prompt (via the researched `imagePrompt`) sent to both providers:**

- **Stability**: complete style failure, worse than Round 1's badge issue
  — ignored the flat-kawaii/solid-white-background instructions entirely
  and produced a photorealistic frog in a full outdoor scene (flowers,
  sky, mountains, dirt ground).
- **OpenAI**: style followed well — flat kawaii illustration, bold clean
  outlines, and the subject's colors visibly match the researched
  `colorPalette` (grass green body, cream belly, pink cheek blush). Same
  Round-1 background problem persists: a dark vignette/glow, not a solid
  flat white background.

**Olga's verdict:** OpenAI. Scored this round **OpenAI +1** (running score
now 2-0). **Reason (asked directly): same as Round 1** — sharper/crisper
image, reads as clean without needing a separate background-removal step.
Two rounds now on the same stated criterion (sharpness + no-background-
removal-needed), not two independent reasons — still short of this doc's
own 5-8 round threshold before treating it as a settled preference, but
the criterion itself is holding up consistently rather than drifting.
Images: `D:\ann\tmp_scratch_genai\stability.png`,
`D:\ann\tmp_scratch_genai\openai.png`.

## Next rounds

Olga wants several more comparison rounds before settling on a
preference. Format going forward, so rounds stay easy to compare:
1. Same theme/prompt across both providers each round (isolates
   provider/style differences from prompt differences).
2. Record the score and — this round's gap — ask Olga *why* she picked
   what she picked, not just log the pick.

## Provider strategy — stay at 2 for now (decided 2026-08-07)

Olga asked about wiring up every candidate provider at once (Recraft,
Google Imagen, Flux, Ideogram, Adobe Firefly) and testing them all in
parallel. **Recommendation: don't, not yet.** Reasoning:

1. **Setup cost is real, not just code.** Each provider is its own
   account/API-key/billing setup (lived this today with Stability and
   OpenAI) — five at once multiplies that friction for Olga, not just
   integration work for Claude.
2. **Signal dilution, not acceleration.** This doc's own threshold is
   "~5-8 rounds before drawing a real conclusion" for **two** providers.
   Five providers per round means either reviewing 5 images per round
   (fatigue) or still testing sequentially anyway — connecting them all
   in advance doesn't change that.
3. **The actual root cause of the current pain point (both providers
   ignoring "no background" text instructions) hasn't been isolated
   yet.** It may not be a per-provider trait at all — it could be a
   shared training-data bias toward "cute mascot" framing, or fixable
   via each API's dedicated `negative_prompt`-style parameter (distinct
   from stuffing negations into the main prompt text, which Round 1
   already showed doesn't work reliably) — **not yet tried**. Adding
   more providers before ruling this out risks re-hitting the same wall
   on each new one.
4. **More integrations = more maintenance surface**, in a space that
   visibly shifts fast (the whole Bedrock model catalog turned out
   different from expectations the same day this doc was started).

**Plan:** stay on Stability + OpenAI through the planned 5-8 rounds; in
one of those rounds, try each provider's real `negative_prompt`
parameter (not prompt-text negation) as a targeted fix for the
background problem before concluding a new provider is needed. If, after
that, neither provider is satisfactory, add **one** more — **Recraft**
specifically, not several — since it's purpose-built for flat/vector
illustration (the actual fit criterion: clean, well-separated color
regions for `pattern-converter.ts`'s k-means step, not general aesthetic
quality). Other candidates considered and set aside for now: Google
Imagen and Flux (solid general options, no specific edge for this use
case), Ideogram (similar), Adobe Firefly (real advantage is licensing
safety for commercial use, not flat-illustration strength specifically —
worth remembering if licensing ever becomes a concern), Midjourney (best
reputation for exactly this style historically, but no official API —
only Discord/unofficial access, ruled out on that basis alone).
