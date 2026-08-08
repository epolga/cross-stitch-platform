# Design Feedback Loop — Track 2 (Opportunity 9) Step 5, detailed spec

Full specification for the accumulated-preference / feedback-learning
mechanism referenced as "step 5" in `OPPORTUNITIES.md`'s Opportunity 9
("the system diffs the AI draft against her edited version and asks 1-2
targeted questions"). Written 2026-08-07, dictated by Olga in full during
a design conversation that grew directly out of the first real Track 2
run (the "Capybara" design — trend detection → image generation →
conversion → manual cleanup, same session). Not yet implemented — this
is the spec to build against, once the open questions at the end are
resolved.

## Why now, and why this shape

`OPPORTUNITIES.md` already ruled out fine-tuning for this pipeline (needs
hundreds of examples, real training cost, catastrophic-forgetting risk,
opaque/unauditable result vs. a plain document Olga can read and hand-edit
— see that doc's Opportunity 9 section). This spec is the concrete,
buildable alternative: **in-context learning from a growing, structured
record of Olga's real corrections**, not model retraining.

## The optimal flow (Olga's diagram)

```
AI result
   ↓
Olga's manual correction
   ↓
compare BEFORE / AFTER
   ↓
automatic diff
   ↓
Olga gives a short reason
   ↓
database of correction examples
   ↓
rules for future generations
```

**Worked example, as Olga described it:** the AI result has 3 isolated
dark stitches around a cat's eye. She deletes them. The system can see
*what* changed:

```
Removed:
(42,31) DMC 3371
(44,29) DMC 3371
(46,32) DMC 3371
```

...but not *why*. So it asks — either free text, or a pick from a preset
reason list (see Reason Tags below). That answer is what turns a diff
into a usable training signal.

## UI/UX flow

1. Olga reviews a generated pattern in the editor.
2. She clicks either:
   - **Approve** (no changes) — the pattern is accepted as-is. **This
     case must be recorded too, explicitly** — it's a positive example,
     showing what Olga considers already correct. Without capturing
     "nothing needed fixing" cases, the record only ever shows what's
     wrong, never what's right.
   - **Approve with changes** — she edits with the normal editor tools,
     then saves.
3. On "Approve with changes," the system already knows the diff (grid
   cells changed, colors merged/added/removed) and shows a short summary,
   e.g.:
   > 36 cells changed · 2 colors merged
4. It asks **one question**: *"What were you mainly fixing?"* — answered
   via preset buttons (see Reason Tags) plus a free-text "Other" option.
5. That's the entire interaction cost to Olga — she is explicitly not
   expected to narrate every individual edit. One summary, one reason,
   done.

Olga's own framing: *"Объяснять каждое движение невыносимо. Но ты можешь
автоматически агрегировать edit"* — explaining every single move is
unbearable, but the diff can be auto-aggregated and reduced to one
question.

## Reason tags (starting preset list)

- Remove visual noise
- Too much detail
- Preserve important detail
- Wrong color
- Merge similar colors
- Improve silhouette
- Simplify background
- Fix anatomy
- Improve composition
- Other (free text)

## Correction record — data schema

Per reviewed pattern (approved as-is, or approved with changes), store:

- `sourceImage` — the original input (e.g. the generated image before
  conversion)
- `aiResult` — the AI-generated grid/palette before Olga touched it
- `correctedResult` — Olga's final saved grid/palette (identical to
  `aiResult` if she approved without changes)
- `gridDiff` — cell-level diff (added/removed/recolored cells)
- `paletteBefore` / `paletteAfter`
- `imageType` — subject/category (e.g. "black cat", "animal silhouette",
  "flower illustration") — needed later for Level 2 similarity retrieval
- `dimensions` (width × height)
- `numberOfColors` (before/after)
- `reasonTags` — one or more from the preset list
- `freeTextComment` — optional
- `acceptedOrRejected` — approve / approve-with-changes (and implicitly:
  every stored record IS an accepted pattern — see Open Questions on
  whether outright-rejected drafts should also be logged)

## Example-record format (human-readable rollup)

For review and for feeding Level 2 few-shot retrieval, individual
corrections roll up into short entries like:

```
Example 17
Input: black cat illustration
AI result: 8 isolated grey stitches around ears
Correction: removed
Reason: visual noise / unnecessary detail

Example 31
Input: dog portrait
AI result: eye simplified too much
Correction: restored 4 dark stitches
Reason: preserve facial detail

Example 54
Input: flower illustration
AI result: 5 similar reds
Correction: merged into 3
Reason: excessive palette complexity
```

## Data store and provenance tracking (resolved 2026-08-08, steps 1-3 built same day)

**Built 2026-08-08 (step 1-2):** `AiDesignGenerations` table + service
(`web/src/lib/ai-design-generations.ts` — `createGeneration()`,
`attachDraft()`, `getGeneration()`; `backfillDesignId()` exists but isn't
wired to any caller yet, step 4 below). `sourceGenerationId`
added to `ConverterPatterns` (`pattern-storage.ts`'s `savePattern()`/
`loadPattern()`; deliberately **not** added to `updatePattern()` — a
write-once provenance marker must survive every later edit unchanged).
Wired into `save-capybara-draft.ts` via a new optional
`[generationMetaPath]` CLI arg (a JSON file with `{theme, imagePrompt,
signalSource, reasoning, imageProvider, grounding}` — the shape
`detectTrend()`'s `TrendDetectionResult` now produces) — omitted entirely
for a non-AI-trend manual save (e.g. the planned Fawn design test).
Verified with a real round-trip against live AWS (create → attachDraft →
getGeneration): grid/palette RLE-encode/decode correctly, status
transitions `generated` → `draft-saved`.

**Built 2026-08-08 (step 3 — the actual server-side diff mechanism):**
`AiDesignCorrections` table + service (`web/src/lib/ai-design-corrections.ts`).
Pure, unit-tested diff logic (`diffPatterns()`, 5 tests) compares by
*resolved DMC number per cell*, not raw palette index, so a palette
reorder alone (e.g. after `removeUnusedColors()` renumbers indices)
doesn't show up as a spurious diff; handles a dimension change (e.g. Size
to Design) by reporting `dimensionsChanged: true` and `cellsChanged: null`
rather than attempting a meaningless positional compare, while
`colorsAdded`/`colorsRemoved` still work. `isEmptyDiff()` identifies the
"Approve, no changes" case. `reviewGeneration()` is the actual server-side
orchestration point 4 of the mechanism below describes: fetches the
immutable snapshot from `AiDesignGenerations`, diffs it against whatever
grid/palette the caller passes as "current," writes the correction row
(auto-classified `approve` vs `approve-with-changes` from whether the diff
is empty — no reason tags stored for a true no-op approve even if passed),
and calls `markReviewed()` to flip the generation's status — **this is
also the first caller that wires `markReviewed()`**. Verified with a real
`createGeneration → attachDraft → reviewGeneration → getGeneration`
round-trip against live AWS: diff correctly counted 1 changed cell,
classified `approve-with-changes`, generation status flipped to
`reviewed`.

**Built 2026-08-08 — the API route + editor UI**, admin-only (see rationale
below): `GET /api/converter/patterns/[id]` now returns `needsAiReview`
(true while the pattern's `AiDesignGenerations` row is still
`draft-saved`); new `POST /api/converter/patterns/[id]/review` calls
`reviewGeneration()` via the two-call protocol described in step 4 above
— first call with no reasons returns the diff (auto-finalizing an empty
one), second call (only reached for a non-empty diff) submits
`reasonTags`/`freeTextComment` and persists. `ConvertClient.tsx` shows an
"AI-draft" badge, a "✓ Approve" button, auto-triggers the review right
after Save on an unreviewed draft, and a modal with the diff summary +
the Reason Tags list above for the "approve with changes" case.

**Admin-only, not a user-facing feature.** Every one of those UI elements
(`isAiDraft`/`needsAiReview` badge, "✓ Approve" button, the auto-trigger
in `handleSave`, and the review modal) is gated behind `isAdmin` in
`ConvertClient.tsx` — none of it renders or fires for a regular logged-in
user, even one who happens to own an AI-draft pattern. **Why:** this
mechanism has nothing to do with a product feature for end users — it
exists purely to let Olga *train the AI pipeline itself* (per this doc's
opening framing, "in-context learning from a growing, structured record
of Olga's real corrections," working toward the pipeline eventually
generating designs with minimal human intervention). A regular user has
no `AiDesignGenerations` row to review, no stake in the correction-log
Level 1/2/3 mechanism, and showing them an "Approve this AI draft" prompt
would be confusing UI for a workflow that isn't theirs. `isAdmin` is
already the existing gate for the adjacent "Publish to Catalog" button in
the same file — this reuses that same boundary rather than inventing a
new one.

Closes open questions #3 and #4 below with a concrete, buildable mechanism
— worked out in a session dedicated to the trend-detection prompt's actual
usefulness (see `OPPORTUNITIES.md` Opportunity 9 for that side of the
discussion: separating the "solid white background" requirement into two
different underlying causes, and the three-way split of "quality" into
grounding/reach/conversion). Two new self-provisioning DynamoDB tables,
following the `SearchEngagement` pattern (`web/src/lib/search-engagement.ts`
— `ensureTable()`, `PAY_PER_REQUEST`, plain string keys).

### Table 1 — `AiDesignGenerations`

One row per trend-detection + image-generation attempt. This is the anchor
both dimensions Olga asked to measure hang off: **prompt → downloads** (via
`imagePrompt` + eventual `designId` → that design's existing `NDownloaded`
field) and **corrections → downloads** (via the link from Table 2 below).

| Field | Type | Notes |
|---|---|---|
| `generationId` (PK) | S | UUID, created right after `detectTrend()` returns |
| `theme` | S | from `detectTrend()` |
| `imagePrompt` | S | exact prompt text sent to the image-generation API — the core of the prompt→downloads measurement |
| `signalSource`, `reasoning` | S | from `detectTrend()` |
| `imageProvider` | S | `"openai"` \| `"stability"` — doubles as Domain 2 (provider choice) data |
| `initialGrid`, `initialPalette` | S (JSON) | immutable snapshot of the AI-generated grid/palette, written once, before Olga ever opens the editor — see "Provenance mechanism" below. Size-checked: even the catalog's largest existing design (241×241) is ~175KB as JSON, comfortably under DynamoDB's 400KB item limit, so no S3 needed. |
| `createdAt` | S (ISO) | |
| `status` | S | `generated` → `draft-saved` → `published` (or `rejected`) — `reviewed` still exists as an enum value (see `markReviewed()`) but the real multi-round flow (2026-08-08) never sets it; `draft-saved` now means "still eligible for review," permanently, for as long as review keeps being offered every save. |
| `patternId` | S, optional | `ConverterPatterns` id once the draft is saved to Olga's account |
| `designId` | N, optional | filled in once actually published to the catalog — the join key to that design's live `NDownloaded` |
| `lastReviewedGrid`, `lastReviewedPalette` | S (JSON), optional | added 2026-08-08 — the pattern's state as of the end of the most recently completed review round. Absent until round 1 completes. The diff baseline for the NEXT round (falls back to `initialGrid`/`initialPalette` if absent). Updated by `recordReviewRound()`. |
| `targetWidth`, `targetHeight` | N, optional | added 2026-08-08 — `detectTrend()`'s researched popular size in stitches for this theme. `targetWidth` sets the conversion scale in `save-ai-draft.ts`; the pair also picks a matching non-square aspect ratio at image-generation time (`pickStabilityAspectRatio`/`pickOpenAiSize` in `image-generation.ts`), so a tall/wide research result is no longer forced back to square. |
| `colorPalette` | S, optional | added 2026-08-08 — `detectTrend()`'s researched popular color combination for the subject; recorded for provenance, already folded into `imagePrompt`'s text by `buildPrompt()`. |

Downloads are never copied into this table — a report joins
`generationId → designId → NDownloaded` at analysis time, reading the
live counter, same principle as the outcome-evaluation plan already in
`OPPORTUNITIES.md`.

### Table 2 — `AiDesignCorrections`

One row per reviewed pattern (approved as-is, or approved with changes).

| Field | Type | Notes |
|---|---|---|
| `correctionId` (PK) | S | UUID |
| `generationId` | S | FK to Table 1 — pulls in the prompt/theme for free |
| `roundNumber` | N | added 2026-08-08 — 1, 2, 3, ... which review round this is for the generation. Multiple rows per `generationId` are now the normal case (every save on an AI-draft offers review, see "Provenance mechanism" point 3), not just one. |
| `designId` | N, optional | same join key, duplicated here for direct queries without hopping through Table 1 |
| `gridDiffSummary` | S (JSON) | compact summary (cells changed, colors merged/added/removed) — not the full before/after grids, those already live via `generationId` → Table 1's `initialGrid` and the pattern's current state |
| `reasonTags` | SS | from the preset list above |
| `freeTextComment` | S, optional | |
| `acceptedOrRejected` | S | `approve` \| `approve-with-changes` — **`approve` is a real, explicitly stored positive record**, not a skipped case (Olga, 2026-08-08: the fact that nothing needed fixing is itself important signal) |
| `createdAt` | S (ISO) | |

### Provenance mechanism — how a diff actually gets computed

1. **Marking a pattern as AI-sourced.** New optional field `sourceGenerationId`
   (S) on `ConverterPatterns` itself, set once, at the moment the
   generation script first calls `savePattern()`. This is both the "AI
   draft" provenance flag the editor can check (to show an "AI-draft"
   label, per the original UX vision) and the link back to Table 1.
2. **The immutable snapshot** (`initialGrid`/`initialPalette` in Table 1)
   is written in that same first `savePattern()` call — before Olga has
   ever opened the editor, so it can never be touched by her later edits.
   `ConverterPatterns` itself stays a single mutable record exactly as
   today; only Table 1 holds the frozen "as-generated" state.
3. **Review is multi-round (revised 2026-08-08).** Originally one-shot:
   the editor showed Approve / Approve-with-changes only while
   `AiDesignGenerations.status` was `draft-saved`, flipping to `reviewed`
   after the first round so the question was asked exactly once per
   generation. Olga's real usage showed this was wrong — she made a
   second real edit (fixing the same draft further) and got no dialog at
   all, no record of the second correction. Changed to: **every save on
   an AI-draft with `sourceGenerationId` offers review**, `status` never
   leaves `draft-saved` for this purpose. Each round is a separate
   `AiDesignCorrection` row (`roundNumber` 1, 2, 3, ...). To keep each
   round's diff meaningful (round 2 should show only what changed in
   round 2, not the cumulative diff since the AI's original output),
   `AiDesignGenerations` gained `lastReviewedGrid`/`lastReviewedPalette`
   — the end-state of the most recently completed round, updated by
   `recordReviewRound()` after every submitted review. `initialGrid`/
   `initialPalette` stay untouched forever, still the true "as the AI
   generated it" record for round-1-vs-original analysis.
4. **The diff is computed server-side**, not in the browser: on
   Approve/Approve-with-changes, the client just sends
   `generationId` (+ `patternId`, reasonTags/comment if any) to a new API
   route; the server reads `initialGrid`/`initialPalette` from Table 1 and
   the pattern's current grid/palette from `ConverterPatterns`, diffs them
   there, writes the `AiDesignCorrections` row, and flips
   `AiDesignGenerations.status` to `reviewed`. The original snapshot never
   needs to round-trip to the browser. An empty diff is exactly the
   "approve, no changes" case — no reason-tag question is asked when
   there's nothing to explain.
5. **`designId` backfill happens at publish time**, which is a separate,
   later step (existing "Publish to Catalog" flow) — `sourceGenerationId`
   needs to be threaded into that call so it can `UPDATE` the resulting
   `designId` onto both the `AiDesignGenerations` row and every
   `AiDesignCorrections` row sharing that `generationId`, once the catalog
   design is actually created.

## Three levels of what to do with the accumulated corrections

**Level 1 — continuously updated rules (buildable now, no training).**
After enough verified patterns (Olga's benchmark: ~100), analyze the
correction log and look for recurring patterns, e.g.: *"In small animal
patterns, the user regularly removes isolated highlight stitches around
the outer silhouette."* Turn that into an explicit rule appended to the
relevant generation prompt:

> For small animal patterns, avoid isolated highlight stitches around
> the outer silhouette unless they represent an important recognizable
> feature.

The next generation receives this rule directly. (Track 1-style parallel:
this already happened once by hand this session — the capybara
composition feedback got written straight into `trend-detection.ts`'s
`buildPrompt()`. Level 1 is that same move, made systematic and
data-driven instead of ad hoc.)

**Level 2 — library of similar corrected examples (stronger than generic
rules).** Before generating e.g. a new black cat design, find the most
relevant past corrections by similarity:

```
New black cat
   ↓
find 5 most relevant corrections
   ↓
AI sees what was wrong before (before → corrected-after pairs)
   ↓
new generation
```

Similarity dimensions Olga named: subject (black cats), broader category
(animal silhouettes), visual property (dark fur), and pattern size.
Stronger than a generic rule like "avoid unnecessary detail" because the
model sees concrete before/after pairs matched to the actual new input.

**Level 3 — real model fine-tuning.** If the specific model in use
supports it, accumulated `(input → undesirable output → corrected
target)` triples could become a training set. **Not where to start.**
Olga's own reasoning: first accumulate enough corrections and find out
whether there are stable, recurring patterns at all — Levels 1 and 2 may
turn out to cover nearly everything needed, making 3 unnecessary.

## Periodic self-formulated-preferences pass

Every ~50 accepted patterns, Olga would prompt (paraphrased, her exact
framing):

> Analyze all my corrections. Don't recount individual cases. Find
> durable rules that explain my decisions. For each rule, show
> supporting and contradicting examples.

Expected output shape:

```
RULE 1
Preserve detail preferentially in faces, especially eyes.
Evidence: 14 corrections. Exceptions: 2.

RULE 2
Remove isolated stitches from smooth backgrounds.
Evidence: 21 corrections. Exceptions: 1.

RULE 3
Prefer larger contiguous color regions over exact local color matching.
Evidence: 17 corrections.
```

Olga then **approves or rejects each rule individually** — this becomes
her own explicit, readable "design policy," extracted from her actual
decisions rather than guessed at. Rejected rules don't get applied even
if the evidence count looks reasonable — she has final say.

## Domains and per-domain advancement plan

Added 2026-08-07, same conversation: Olga's worked examples in this doc
happened to all come from one domain (stitch-level pattern edits) — not
because the other domains don't matter, but because that's what she
happened to illustrate with. This section is the explicit list of every
domain identified so far, so none get silently dropped, plus a concrete
per-domain plan: what one record looks like, a provisional threshold for
moving from manual logging to rule-extraction (Level 1), and where that
domain's rules actually get applied once extracted.

**On thresholds:** Olga's "~100 verified patterns" / "every ~50" numbers
were said generally, not necessarily as a fixed rule for every domain.
Today's own image-prompt correction (subject size/background) showed an
actionable pattern after a single real example, not 100 — a narrow,
low-variability domain can reach "obviously worth turning into a rule"
much sooner. Treat the numbers below as provisional starting points, not
fixed law — revisit per domain once records actually accumulate.

**Decided 2026-08-07: start with Domain 1 (image-prompt composition),
manual accumulation only — no tooling/UI yet.** Records live in
`docs/genai-growth/CORRECTIONS_LOG.md`, one section per domain.

### Domain 1 — Image-prompt composition (STARTING DOMAIN)

- **What:** corrections to `trend-detection.ts`'s `imagePrompt` output —
  subject framing/size, background presence, style directives.
- **One record:** the imagePrompt text before, what Olga said was wrong,
  the corrected framing/instruction, and (once available) the resulting
  image.
- **Already has one real example:** today's "subject too small, drop the
  scene/background" correction — already folded directly into
  `buildPrompt()`'s literal template text (a Level-1 rule applied by
  hand, before any formal accumulation process existed).
- **Provisional threshold to formalize into Level 1:** low (3-5 records)
  — this domain has few degrees of freedom (framing, background, style),
  so patterns should show up fast.
- **Where rules apply:** directly in `trend-detection.ts`'s
  `buildPrompt()` template.

### Domain 2 — Image-provider / model style choice

- **What:** which provider/model (Stability, OpenAI, others later)
  produces results Olga actually prefers, and why.
- **One record:** already the exact shape of
  `IMAGE_GENERATION_PREFERENCES.md`'s per-round entries (prompt used,
  providers compared, Olga's pick, her stated reason).
- **Status:** informally started 2026-08-07 (round 1: OpenAI 1-0
  Stability, reason = "sharper, reads as backgroundless without an
  extra step").
- **Provisional threshold:** ~5-8 rounds before drawing any real
  provider preference conclusion (explicitly flagged as premature at
  n=1 in that file already).
- **Where rules apply:** which `generateImage*` function
  `image-generation.ts`'s pipeline calls by default, and/or provider-
  specific prompt phrasing if one model responds better to different
  wording.

### Domain 3 — Pattern-conversion parameters

- **What:** the scalar/categorical choices in `convertImage()` calls —
  target width, max colors, `mode` (photo/illustration/line-art),
  `colorDistanceMode`, and the script-side background-erasure tolerance
  (`detectBackgroundByFloodFill`'s threshold).
- **One record:** parameters used, what Olga changed about the result
  (e.g. "too many colors, merge these two"), corrected parameter value
  if there's a direct one, or a qualitative note if not.
- **Status:** not started — today's capybara run picked these values by
  judgment (25 colors, 80px width, `final-only`), not from any prior
  record.
- **Provisional threshold:** ~8-10 records — more degrees of freedom
  than Domain 1, likely needs more evidence before a rule is safe to
  generalize (e.g. "always use N colors" could easily be true only for
  simple flat-illustration subjects, not photo-mode conversions).
- **Where rules apply:** default arguments in whatever script/UI path
  calls `convertImage()` for a new AI-generated design.

### Domain 4 — Stitch-level manual touch-ups

- **What:** Olga's worked example throughout most of this doc — local
  edits to an already-converted grid (isolated stitches removed,
  specific detail preserved near a recognizable feature, colors merged).
- **One record:** the full schema in "Correction record — data schema"
  above (diff, reason tag, before/after palette, etc.) — this is the
  domain that section was written against.
- **Status:** not started as a formal log (today's real touch-ups —
  confetti/background/size-to-design/remove-unused — were pipeline bugs,
  not preference data; see Notes below, item 2 unchanged).
- **Caution (already raised, still stands):** examples like "preserve
  detail near the eyes" are spatially/semantically local — a global
  Level-1 rule can't easily express "near an eye" without some spatial
  understanding of the specific image (a vision-model read, most
  likely). This domain may need to reach Level 2 (similar-example
  retrieval) sooner than the others, rather than living comfortably in
  Level 1 rules for long. Provisional threshold for attempting Level 1
  anyway: ~15-20 records, specifically to see whether *global* rules
  ("prefer larger contiguous regions over exact local color match" —
  Olga's own Rule 3 example) turn out to cover most cases even without
  spatial awareness, before concluding Level 2 is actually necessary.
- **Where rules apply:** either the conversion pipeline's own heuristics
  (`removeConfetti`, `detectBackgroundByFloodFill`, `removeUnusedColors`
  parameters) for global rules, or a retrieval step feeding example
  pairs to a review-assist prompt for local/contextual ones.

### Domain 5 — Newsletter / Ann-voice copy

- **What:** corrections to generated newsletter/email copy — tone,
  factual accuracy about what Ann did or didn't do, framing choices.
- **One record:** the draft text, what was wrong, the corrected text,
  the reason.
- **Status:** two real examples already happened today (informally, not
  logged): don't claim Ann personally stitched an AI-sourced design;
  drop "trending everywhere" framing when it doesn't fit. Not yet
  written down anywhere as structured records — first thing to do if
  this domain gets picked up.
- **Provisional threshold:** ~5-8 records — text tone corrections tend
  to be somewhat repeatable ("don't do X") once a few surface.
- **Where rules apply:** a short "Ann voice — do/don't" addendum,
  either inside `Ann_Persona_and_Newsletter_Content.md` or a new
  sibling doc, consulted before drafting any AI-sourced-design
  announcement copy.

### Explicitly out of scope for this mechanism

**Trend/theme selection quality** (was "capybara" a *good* theme to
pick?) is deliberately **not** part of this correction-log system — it
already has its own evaluation mechanism, the reach/conversion
outcome-evaluation plan in `OPPORTUNITIES.md`'s Opportunity 9 (real
post-publish traffic/download data, not a manual correction Olga makes
in an editor). Don't conflate the two.

## Notes and open questions (Claude's additions, not yet resolved with Olga)

These came up while reviewing the spec against today's real pipeline —
flagging them rather than deciding unilaterally:

1. **Different domains need separate rule sets.** Today alone produced
   three distinct kinds of correction: image-prompt composition (subject
   size/background), pattern-conversion pipeline gaps, and Ann-voice/
   newsletter copy tone. A rule mined from image-prompt corrections
   ("avoid isolated highlight stitches") has no bearing on newsletter
   copy, and vice versa. The correction log and the Level-1 rule sets it
   produces should be scoped per domain, not pooled into one undifferentiated
   pile — otherwise Level 1's pattern-mining will either miss real
   signal (diluted across unrelated domains) or produce rules that get
   misapplied in the wrong context.
2. **Not every correction is a "preference" to learn — some are just bugs.**
   Today's post-conversion pipeline gaps (missing confetti removal,
   missing background erasure, missing thumbnail, stale palette entries)
   weren't stylistic choices Olga made differently each time — they were
   the script simply not doing what the editor always does. Those get
   fixed once in code (already done, `save-capybara-draft.ts` +
   `feedback_script_pattern_full_pipeline` memory) and should **not**
   pollute the correction-learning dataset as if they were recurring
   design preferences.
3. ~~**Where does the diff actually get computed?**~~ **RESOLVED
   2026-08-08** — see "Data store and provenance tracking" above:
   `sourceGenerationId` on `ConverterPatterns` marks provenance; the
   immutable pre-edit snapshot is written to `AiDesignGenerations` at
   first `savePattern()`, before any editing is possible; the diff is
   computed server-side on an explicit Approve/Approve-with-changes
   action, not on every save.
4. ~~**Where does the correction database live?**~~ **RESOLVED
   2026-08-08** — two new self-provisioning DynamoDB tables,
   `AiDesignGenerations` and `AiDesignCorrections`, see "Data store and
   provenance tracking" above.
5. **Scope for the first build:** Olga has confirmed starting with a
   single domain before generalizing to all three — which domain to
   start with is still open (image-prompt composition is the natural
   candidate: it already has one real logged example from today, in
   `IMAGE_GENERATION_PREFERENCES.md`).
6. **Should outright-rejected drafts (never approved at all) get logged
   too?** Not addressed explicitly in the spec above — worth deciding,
   since a fully-discarded draft is arguably as informative as a
   heavily-corrected one.
