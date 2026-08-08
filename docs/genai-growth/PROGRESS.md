# GenAI Initiative Progress

## Current Status
**Current milestone:** Two parallel tracks as of 2026-08-06 (Olga's decision — split working time between them rather than sequencing):
1. **Phase 1, Python, `search-service/`** — Step 1 (bare FastAPI skeleton) and Step 2 (Pydantic models + `/evaluate` endpoint computing retrieval metrics) both done. Step 3 is now fully built end-to-end, shipped 2026-08-07: Node.js data-collection (Parts A/B/C — logging what was shown, click engagement, weighted downloads) plus the Python evaluation consumer (`app/evaluation.py` + `scripts/evaluate_recent_searches.py`), verified with a real (empty-result) dry-run against production. Remaining: nothing to build — just wait for real search traffic to accumulate, then re-run the script for real numbers.
2. **Opportunity 9, Node.js** — automated design generation from trending themes with a feedback-learning loop. Not started. See `OPPORTUNITIES.md` Opportunity 9 for scope and the Language decision (Node.js, not Python — depends on reusing `pattern-converter.ts`; likely lives inside `web/`, not a separate service).
**Overall state:** Architecture review done. Python skeleton exists, runs locally, not deployed anywhere. Opportunity 9 not yet started.

## Completed
- Defined development-first / learning-in-parallel approach.
- Defined proactive opportunity discovery.
- Defined evidence-based skill tracking.
- Defined initial GenAI roadmap.
- Separated GenAI growth documentation from production code.
- Resolved local Python install discrepancy (2026-08-06): `python` and `py`
  disagreed (3.13.2 vs 3.13.14) because two separate installs existed — a
  python.org installer at `C:\Python313\` (registered in `HKLM`) and a
  Microsoft Store package (registered in `HKCU`, which the `py` launcher
  prefers per PEP 514). Removed the Store package
  (`PythonSoftwareFoundation.Python.3.13`); `python` and `py` now both
  resolve to `C:\Python313\` (3.13.2), sharing one pip/site-packages
  (`AppData\Roaming\Python\Python313\site-packages`).
- **Phase 0 (Repository and Architecture Review), 2026-08-06.** Full
  writeup: `docs/genai-growth/ARCHITECTURE_SUMMARY.md`. Headline finding:
  Opportunities 1 (natural-language search) and 2 (semantic/hybrid search)
  in `OPPORTUNITIES.md` — previously tracked as CANDIDATE — are already
  built and live in production (`HeroSearch.tsx`, `ai-search/route.ts` on
  Claude Opus, `semantic-search.ts` on Bedrock Titan embeddings, hybrid
  merge in `data-access.ts`). Also found a proven agentic tool-use loop
  already in the codebase (`automation/pinterest-agent/src/services/aiToolsScan.ts`,
  handles `pause_turn` continuation and a documented `max_uses_exceeded`
  failure mode) — useful prior art for Phase 5/7. `OPPORTUNITIES.md`
  updated with reuse-path detail for Opportunities 1, 2, 4, 6, 7.
  **Correction (same day, caught by Olga):** the review's first pass
  wrongly claimed Stitch Mode progress (`stitchedCells`) isn't persisted
  server-side. It is — `pattern-storage.ts`'s `saveProgress()`/`progress`
  attribute, debounced `PUT .../progress` from `ConvertClient.tsx`, reload
  on open. Fixed in `ARCHITECTURE_SUMMARY.md` and `OPPORTUNITIES.md`
  Opportunity 7. Lesson: verify a subagent's specific factual claims
  (not just that cited files/models exist) before passing them to Olga.

## In Progress
- **Track 1 (Python)**: `search-service/` skeleton built 2026-08-06 (new
  top-level folder, `.venv`, FastAPI+uvicorn+pytest+httpx). `/health` and
  `/evaluate` (precision@k, recall@k, MRR over `app/metrics.py`, pure
  functions + Pydantic schemas in `app/schemas.py`) both implemented and
  tested. **Deployed for real (ADR-008):** Lambda `search-service`
  (Python 3.13) behind API Gateway HTTP API, live at
  `https://c9mkmhf9bi.execute-api.us-east-1.amazonaws.com` — both
  `/health` and `/evaluate` verified with real `curl` requests against
  the public endpoint. `search-service/deploy.ps1` (mirrors
  `automation/pinterest-agent/lambda/deploy.ps1`) makes this repeatable.
  Solved Linux-wheel packaging for `pydantic-core`'s compiled component;
  found+fixed a real API Gateway quick-create bug (missing Lambda invoke
  permission) and a real PowerShell parser bug (em-dash inside a string
  literal). See ADR-008 for full detail. Earlier skeleton committed to
  git (`bb455e5`), deploy-script/Lambda additions committed same day
  (`36cfdc2`), pushed. **Step 3 explicitly deferred to the next session**
  (Olga's call, 2026-08-06) — not started today. See Next Actions below
  for exactly where to pick it up.
- **Track 2 (Node.js)**: Opportunity 9 (design generation) scoped
  2026-08-06. **Step 1 (trend detection) built 2026-08-07**:
  `web/src/lib/trend-detection.ts` — `detectTrend()` reuses
  `aiToolsScan.ts`'s proven `web_search` + `pause_turn`-continuation
  pattern, but asks for structured JSON (`{ theme, imagePrompt,
  signalSource, reasoning }`) instead of that file's free-text email
  body, since this feeds the next pipeline step automatically. Prompt
  restricts sources to cross-stitch-specific signals (Pinterest
  cross-stitch tags, Etsy cross-stitch bestsellers, r/CrossStitch,
  cross-stitch Google Trends) per the OPPORTUNITIES.md design, and passes
  a sample of existing catalog album captions (`getAllAlbumCaptions()`)
  as a soft "don't repeat these" list. Guards against hallucinated trends
  by checking the response actually contains a `server_tool_use` block
  (real search evidence, confirmed via
  `automation/pinterest-agent/scripts/_diag_search_error.ts`) before
  trusting the result — refuses (returns `null`) rather than trusting an
  ungrounded answer. Same split as the Python evaluation consumer: pure,
  no-I/O helpers (`extractJson`, `hasRealWebSearchEvidence`, `buildPrompt`)
  are exported and unit-tested (`trend-detection.test.ts`, 8 tests, no
  API calls); the actual Anthropic call stays in the thin, untested
  `detectTrend()`.

  **Run live for real 2026-08-07** (`web/scripts/run-trend-detection.ts`,
  kept as the only trigger that currently exists — the real trigger
  mechanism is still an open, deferred decision): found **"capybara"** —
  cited real evidence (a Pinterest board "44 Capybara Cross Stitch ideas
  in 2026", Etsy kawaii-capybara listings, Lord Libidan's Etsy-bestseller
  trend analysis), confirming `server_tool_use` fired for real, not a
  hallucinated answer. Manually verified against the live catalog: **zero**
  existing capybara-themed albums (checked all 114, not just the
  avoid-list sample) — genuinely uncovered, the dedup worked correctly
  this run. **Found and fixed a real gap during that verification**:
  `MAX_AVOID_LIST_SIZE` was 80 but the catalog already has 114 albums,
  so the alphabetically-last ~30% were silently excluded from the
  "don't repeat these" list — didn't cause a wrong result this run
  ("capybara" sorts well inside the first 80), but was a live bug
  nonetheless. Raised to 200 (comfortable headroom) and updated the
  matching test.

  Still needed for the rest of the pipeline: an image-generation model
  (new integration, not yet evaluated), wiring into `pattern-converter.ts`,
  and a feedback-capture/preference-document mechanism (in-context
  learning, not fine-tuning — see `OPPORTUNITIES.md` Opportunity 9 for why
  fine-tuning was ruled out).

## Next Actions
1. **Track 1 Step 3 — in progress, three-part plan (2026-08-07):**
   decided with Olga: (A) log the actual displayed `retrievedIds` per
   search — **done 2026-08-07**, see below; (B) click-through logging on
   search-result design cards, tied by `searchId`, into a new
   `SearchEngagement` table — **not started, pick up here next**; (C)
   weight downloads higher than plain clicks in the eventual relevance
   signal — deferred until (B) exists and real data can be compared.
   Deployed Lambda (`search-service`, live at
   `https://c9mkmhf9bi.execute-api.us-east-1.amazonaws.com`) is ready to
   receive the actual `/evaluate`-consuming logic once (A)+(B) have
   accumulated enough real data — no further deploy-plumbing needed.

   **Part A shipped 2026-08-07:** `SearchQueries` now captures what was
   actually shown, not just the query. Two-phase write, since neither
   search API route computes the final merged/ranked list —
   `data-access.ts`'s `fetchFilteredDesigns()` does that later and can
   reorder relative to either route's own raw ranking (e.g. text search:
   semantic ranking is subordinate to the hard text filter). `logSearch()`
   (`web/src/lib/search-log.ts`) now returns a `searchId`; `ai-search`/
   `image-search` routes return it to `HeroSearch.tsx`, which round-trips
   it through the URL (`?searchId=...`) back to `page.tsx`; once
   `fetchFilteredDesigns()` resolves, `page.tsx` calls the new
   `logSearchResults(searchId, designs.map(d => d.DesignID))` to
   `UPDATE` the same `SearchQueries` row with the real displayed list.
   Only fires when `searchId` is present — plain catalog browsing/
   pagination never sets it, so this doesn't touch normal traffic. Full
   schema detail: `docs/integration/dynamodb-schema.md` §4.14. Verified:
   `tsc --noEmit` clean, Vitest 61/61 still passing, `next lint` shows
   only pre-existing warnings in unrelated files.

   **Part B shipped 2026-08-07:** new self-provisioning `SearchEngagement`
   table (`web/src/lib/search-engagement.ts`, following the
   `EmailEntryEvents`/`EditorEvents` self-provision pattern, not
   `SearchQueries`' manual one) — one row per `(searchId, designId)` pair,
   `action`/`weight` (`click`=1, `download`=2) upgraded-never-downgraded
   via a `ConditionExpression`. New `POST /api/search-engagement` endpoint.
   `searchId` threaded as an optional prop through `page.tsx` →
   `DesignListWrapper` → `DesignList` → `DesignCard` — only set on an
   actual AI/semantic search hand-off, so plain catalog/album browsing
   never logs anything. `DesignCard`'s link now fires a fire-and-forget
   `fetch(..., { keepalive: true })` click log on click (survives the
   navigation the click itself causes). Full schema:
   `docs/integration/dynamodb-schema.md` §4.17. Verified: `tsc --noEmit`
   clean, Vitest 61/61, `next lint` no new warnings.

   **Part C shipped 2026-08-07: the `download` action is now wired,
   both download paths.** New shared client helper
   (`web/src/lib/search-engagement-client.ts`, `logSearchEngagementClient`)
   used by both `DesignList.tsx` (click) and `DownloadPdfLink.tsx`
   (download), replacing the Part B version's inline fetch. `searchId`
   reaches a download two ways: (1) directly as a prop when downloaded
   straight from a search-result card; (2) appended to the design-page
   URL (`designUrlWithSearchId()` in `DesignList.tsx`) when the user
   clicks through first — threaded `app/[slug]/page.tsx` →
   `app/designs/[designId]/page.tsx` (new `searchParams` prop, wasn't
   accepted before) → `DesignDownloadControls` (new `searchId` prop) →
   `DownloadPdfLink`. Both paths funnel through `DownloadPdfLink`'s
   existing `recordDownload()` callback, the one place all three download
   modes (free/register/paid) already converge before opening the PDF.
   Known gap, judged acceptable: prev/next/"you may also like" links on
   the detail page don't carry `searchId` forward. Verified: `tsc --noEmit`
   clean, Vitest 61/61, `next lint` no new warnings, full `next build`
   run to confirm the page-signature changes (`searchParams` added to
   `app/designs/[designId]/page.tsx`) don't break routing.

   Binary relevance only so far for `/evaluate` itself —
   `search-service/app/metrics.py`'s `relevant_ids` is still a plain set;
   a weighted precision/recall variant is future work, not scoped yet.

   **Python `/evaluate` consumer shipped 2026-08-07** (same day, once
   Olga caught that "wait for real traffic" only blocks getting
   *meaningful numbers*, not writing/testing the code itself — corrected
   mid-session): `search-service/app/evaluation.py` — pure functions
   (`evaluate_search`, `evaluate_all`) that turn `SearchQueryRecord`/
   `EngagementRecord` data into per-search and aggregate precision@k/
   recall@k/MRR via the existing `app/metrics.py`. Deliberately zero I/O,
   so it's fully unit-tested on synthetic fixtures
   (`tests/test_evaluation.py`, 5 new tests, 17/17 passing overall) without
   needing real accumulated traffic — mirrors keeping business logic out
   of a repository/DbContext layer in C#/.NET. The actual DynamoDB-reading
   side is a separate, deliberately thin script,
   `search-service/scripts/evaluate_recent_searches.py` (boto3, kept in a
   new `requirements-dev.txt` rather than `requirements.txt` since the
   deployed Lambda itself never touches DynamoDB — bundling boto3 into
   the Lambda zip would be dead weight). Ran it for real against
   production (read-only Scan): correctly reports `0` evaluable
   searches right now — `SearchEngagement` doesn't exist yet since no
   real click/download has landed since today's deploy — confirming the
   whole pipeline is wired correctly end-to-end, just waiting on traffic
   for real numbers. Verified: `pytest` 17/17, live dry-run against real
   AWS.

   **Track 1 Step 3 is now fully built, both data-collection (Parts A/B/C)
   and the evaluation consumer** — nothing left to code; next step is
   purely waiting for real search traffic to accumulate, then re-running
   `evaluate_recent_searches.py` for actual numbers.
2. **Track 2 — pick up here next session:** Build order decided 2026-08-06
   (see `OPPORTUNITIES.md` Opportunity 9 "UX vision" / "Build-order
   decision"): build the core pipeline first (trend detection → image
   generation → `pattern-converter.ts` → editor review → diff/feedback
   questions → publish via the existing "Publish to Catalog" button),
   decide the trigger mechanism (button vs. scheduled) later — it's a
   thin, swappable front end that doesn't affect the core build.
   **Trend detection (step 1) built AND run live 2026-08-07** — found
   "capybara", see the In Progress entry above for full detail.
   **Image-generation model comparison (step 2) started same day** —
   pivoted away from Bedrock (Titan end-of-life, Stability's Bedrock
   catalog is edit-only tools, Nova Canvas Legacy/AccessDenied) to
   calling Stability AI and OpenAI directly; round 1 done, OpenAI 1-0,
   full detail and running score in the new
   `docs/genai-growth/IMAGE_GENERATION_PREFERENCES.md`. More rounds
   planned before drawing a real conclusion. Still open: decide the
   trigger mechanism (button vs. scheduled — Olga wants to revisit this
   once the pipeline is more settled).

   **First real end-to-end run, same day:** the OpenAI capybara image
   (raw, with its vignette background — Olga's explicit pick, not the
   background-removed version) went through `pattern-converter.ts`
   (`illustration` mode, `final-only`/CIEDE2000, 120px wide, cap 25
   colors) and came out at **120x120, 18 colors** — saved to Olga's own
   account as a normal `ConverterPattern`
   (`web/scripts/save-capybara-draft.ts`, pattern id
   `e7ec7a26-512e-41fa-9701-011547a937a7`), viewable at
   `/profile/patterns` like any manually-saved pattern. Deliberately
   **not** run through "Publish to Catalog" (`/api/admin/publish-to-catalog`)
   — that creates a real Pinterest pin and a live, publicly-indexed
   catalog entry with no automatic rollback; Olga explicitly asked for
   the lower-stakes "save to my account" step instead, matching
   `OPPORTUNITIES.md`'s UX vision step 3 (she reviews the draft in the
   editor before any decision to actually publish). The script calls
   `pattern-storage.ts`'s `savePattern()` directly with her admin `cid`
   (looked up once via a throwaway script,
   `CrossStitchUsers` PK `USR#<email>` → `cid` attribute) — bypassing the
   HTTP/session-cookie layer the same way existing admin scripts like
   `stamp-editor-pattern.ts` already do, not a new pattern.

   Post-conversion cleanup needed real iteration to match what the editor
   normally does automatically (confetti removal, background erasure via
   a border flood-fill since pattern-converter.ts has no alpha
   awareness, Size to Design, Remove Unused, server-side thumbnail) —
   `save-capybara-draft.ts` is now the reference implementation of the
   full pipeline; see `feedback_script_pattern_full_pipeline` memory.

   **Next real discussion (Olga's ask, 2026-08-07, after she edits this
   capybara draft herself and sends her newsletter): a real version of
   step 5's diff/feedback loop.** She wants Claude to remember her manual
   corrections to an AI draft, ask *why* she made each one, and
   accumulate that into the preference document — not just for image
   models (already doing that manually in
   `IMAGE_GENERATION_PREFERENCES.md`) but as a general mechanism so the
   *next* AI-generated design comes out closer to what she wants without
   repeating the same corrections. This is exactly `OPPORTUNITIES.md`
   Opportunity 9 step 5 as originally scoped — next step is designing the
   concrete mechanics (what counts as a "correction" worth asking about,
   where the diff comes from given the editor has no automatic AI-draft
   vs. edited-version comparison yet, how the accumulated preferences
   actually get fed back into future `imagePrompt`/conversion-parameter
   choices).

   **Full spec written same day: `docs/genai-growth/DESIGN_FEEDBACK_LOOP.md`.**
   Olga dictated the complete mechanism in detail — diff → short reason
   tag → correction-example database → three levels of what to do with
   it (accumulating rules now / similar-example retrieval next / real
   fine-tuning deferred), plus a periodic self-formulated-preferences
   pass every ~50 accepted patterns that Olga approves or rejects rule by
   rule. Not yet implemented (no UI/diff tooling) — that doc is the spec
   to build against.

   **Decided: 5 domains identified (image-prompt composition,
   image-provider choice, conversion parameters, stitch-level manual
   touch-ups, newsletter/Ann-voice copy), each with its own provisional
   record-count threshold before attempting Level-1 rule extraction —
   see `DESIGN_FEEDBACK_LOOP.md`'s "Domains and per-domain advancement
   plan."** Starting with Domain 1 (image-prompt composition), manual
   log only, no tooling yet. Records now actually being kept in the new
   `docs/genai-growth/CORRECTIONS_LOG.md` — 2 real entries logged
   2026-08-07 (Domain 1: the capybara composition fix; Domain 5: the
   newsletter stitching-claim/trending-framing fix). Next: keep logging
   real corrections as they happen; revisit each domain's threshold once
   its record count gets close.

   **Real candidate theme surfaced 2026-08-08, from a live customer
   email (Linda, via `web/plan/_draft_email_linda_2026-08-08.md`):** the
   catalog has no Fawn design sized close to 5x7"/8x10" print sizes
   (existing ones are square ~10"x10" or badly-proportioned, e.g.
   108x187 stitches). Good next manual test of the pipeline — skip
   `detectTrend()` for this one run (theme is already known and demand
   is real, not inferred), go straight to image generation with target
   ~70x98 or ~112x140 stitches, run through `save-capybara-draft.ts`'s
   pipeline (rename away from the capybara-specific filename once reused
   for a second design). See `docs/Focus.md`'s "Next session" entry for
   the same note.

   **2026-08-08 session — questioned the pipeline's actual usefulness,
   not just its mechanics; resolved into concrete design + real code:**
   - `DESIGN_FEEDBACK_LOOP.md` open questions #3 (where the diff gets
     computed) and #4 (where the correction database lives) resolved
     with a concrete mechanism: two new self-provisioning DynamoDB
     tables, `AiDesignGenerations` (one row per trend+image-gen attempt,
     `imagePrompt` + an immutable `initialGrid`/`initialPalette` snapshot
     written before any editing is possible) and `AiDesignCorrections`
     (one row per Approve/Approve-with-changes review, diff computed
     server-side); a new `sourceGenerationId` field on `ConverterPatterns`
     marks AI provenance; `designId` backfilled at publish time. Ties
     both prompt-composition choices and manual corrections back to real
     per-design `NDownloaded` counts — Olga's explicit ask (two separate
     measurable dimensions: prompt→downloads, corrections→downloads).
     Not yet implemented (schema/mechanism only). Full detail in
     `DESIGN_FEEDBACK_LOOP.md`.
   - Re-examined the "solid flat white background" rule in
     `trend-detection.ts`'s `imagePrompt` output — it conflates a fixable
     `pattern-converter.ts` limitation (border flood-fill has no alpha
     awareness) with the original, still-valid color-quantization
     constraint (clean/limited color regions), and was generalized from a
     single example (the capybara run), below this doc's own 3-5-record
     threshold for formalizing a Level-1 rule. Not yet changed — flagged
     as worth reconsidering, not decided unilaterally. Full detail in
     `OPPORTUNITIES.md` Opportunity 9.
   - Identified "was this trend finding actually good" (grounding) as a
     measurement gap distinct from reach/conversion, and — unlike those
     two — checkable immediately, before spending money on image
     generation. **Built the same day:** `assessGrounding()` in
     `trend-detection.ts` — a zero-marginal-cost, deterministic check
     using citation data the Anthropic SDK's `web_search` responses
     already carry (`ServerToolUseBlock.input.query`,
     `CitationsWebSearchResultLocation`'s `url`/`title`/`cited_text` on
     `TextBlock.citations`) but that nothing previously read. Gate:
     `>=2` distinct cited URLs, at least one from an allowed
     cross-stitch-relevant domain (pinterest.com, etsy.com, reddit.com,
     trends.google.com) — a failing gate is a flag for manual review, not
     an automatic reject (no real-world calibration data exists yet).
     **Wired into `detectTrend()`**: `TrendDetectionResult` now carries a
     `grounding` field; content is accumulated across the full
     `pause_turn` continuation loop (not just the final response) so
     citations from an earlier turn aren't missed; a failing gate logs a
     `console.warn` rather than blocking the result. 5 new unit tests
     (gate passes/fails on citation count/domain, URL dedup, empty
     response), all pure/no-I/O per the file's existing pattern. Verified:
     `tsc --noEmit` clean, Vitest 74/74 (was 61 as of 2026-08-07), `next
     lint` clean. Not yet consumed by any caller beyond
     `run-trend-detection.ts` printing it as part of the JSON dump — no
     pipeline step acts on `passesGate` yet.
   - **Built 2026-08-08 (same day, later): `detectTrend()` now also
     researches size and color, not just theme.** Olga's ask: the
     research should also determine what pattern *size* and *color
     combination* are currently popular for the chosen subject, based on
     the same cross-stitch-specific search sources — not just the theme
     text/image-prompt. `ParsedTrend` gained `targetWidth`/`targetHeight`
     (approximate popular size in stitches — a starting point for the
     conversion step, not a hard requirement) and `colorPalette` (short
     description of the subject's popular color combination — the
     background stays solid flat white regardless, that's a fixed
     technical constraint of the conversion pipeline's background-erasure
     step, unrelated to color trends). `buildPrompt()` and `extractJson()`
     updated to match; `imagePrompt`'s instructions now tell the model to
     use the researched palette for the subject's own coloring. Web search
     stays the only signal source for now (Olga explicitly chose to defer
     wiring in the site's own `SearchQueries` log as a second source).
     Verified: Vitest 14/14 in `trend-detection.test.ts` (was 12), `tsc
     --noEmit` clean.
   - **Built 2026-08-08 (same day, next increment): wired targetWidth/
     targetHeight/colorPalette through the save pipeline and renamed
     `save-capybara-draft.ts` → `save-ai-draft.ts` (git mv, history
     preserved) — it was never actually capybara-specific, only the
     filename and default `--name` were, and Olga pointed out it was time
     to stop treating it as a one-off.** `AiDesignGeneration` /
     `createGeneration()` in `ai-design-generations.ts` gained optional
     `targetWidth`/`targetHeight`/`colorPalette` fields, written to
     `AiDesignGenerations` when a generation-meta JSON provides them.
     `save-ai-draft.ts` now uses `generationMeta.targetWidth` (falling
     back to the old hardcoded 80 as `DEFAULT_TARGET_WIDTH` when absent)
     as the conversion scale. **Deliberately NOT using `targetHeight`
     directly for conversion** — flagged explicitly in a code comment: the
     source image is still always generated square (`image-generation.ts`
     has no aspect-ratio parameter wired up yet), so forcing a non-square
     `targetWidth`×`targetHeight` through `convertImage()`'s `fit:'fill'`
     resize would stretch/distort the image. Height is still derived from
     the actual generated image's own (currently always ~square) aspect
     ratio, same as before. **Known follow-up, not yet built (at the
     time):** give `generateImageStability()`/`generateImageOpenAI()` an
     aspect-ratio parameter and pick the closest supported ratio from the
     researched `targetWidth`/`targetHeight` before generating, so a
     non-square research result (e.g. a tall portrait) can actually be
     honored end-to-end instead of only affecting scale. Verified: `tsc
     --noEmit` clean, `next lint` no new warnings, Vitest 80/80 (unchanged
     — neither file has pure logic worth unit-testing beyond what already
     exists; both are I/O-heavy DDB/script code, consistent with this
     file's established pattern for such files).
   - **Built 2026-08-08 (same day, closes the follow-up above): non-square
     image generation, picked from researched size.** `image-generation.ts`
     gained two pure, unit-tested helpers — `pickStabilityAspectRatio(w, h)`
     (nearest of Stability's 9 supported `aspect_ratio` values: 21:9, 16:9,
     3:2, 5:4, 1:1, 4:5, 2:3, 9:16, 9:21) and `pickOpenAiSize(w, h)`
     (nearest of gpt-image-1's 3 supported sizes: square/portrait/
     landscape) — both use log-scale distance so e.g. 2:1 and 1:2 are
     equally "far" from square rather than a plain diff favoring wide
     ratios. `generateImageStability()`/`generateImageOpenAI()` now take an
     optional aspect-ratio/size argument (default unchanged: square).
     `run-image-generation-test.ts` (the manual provider-comparison script)
     takes optional `targetWidth`/`targetHeight` CLI args and requests the
     matching ratio from each provider when given. `save-ai-draft.ts`'s
     comment updated — it only ever consumes an already-generated image
     file, so once whichever script generates that file passes the
     researched ratio through, `save-ai-draft.ts`'s existing "derive height
     from the image's own aspect ratio" logic already carries it through
     correctly with no further change needed there. New
     `image-generation.test.ts`, 9 tests (both pickers: square, portrait,
     landscape, mirror-symmetry, mild-ratio-falls-back-to-square).
     Verified: `tsc --noEmit` clean, `next lint` no new warnings, Vitest
     89/89 (was 80).
   - **First live end-to-end run of the whole updated pipeline, 2026-08-08:**
     real `detectTrend()` → real `generateImageStability()`/
     `generateImageOpenAI()` with the researched aspect ratio, on a genuinely
     new theme (not capybara — Olga explicitly pushed back on re-testing an
     already-known theme, correctly: the whole point is finding new ones).
     Found **"kawaii cottagecore frog"** (real Etsy/Pinterest signal cited in
     `reasoning`/`signalSource`), `targetWidth: 105, targetHeight: 100`
     (near-square — pickers correctly chose 1:1/1024x1024, but didn't
     exercise a real non-square case). **Two real findings, not just a
     smoke test:** (1) grounding gate failed for real for the first time
     outside a synthetic test (`distinctCitedUrls: 0` despite 15 real search
     queries) — see the `buildPrompt()` fix below. (2) Stability regressed
     versus Round 1 — ignored the style/background instructions entirely,
     produced a full photorealistic outdoor scene, worse than Round 1's
     "added an unwanted badge but kept the right style" failure. OpenAI held
     the line from Round 1: correct flat-kawaii style, colors matching the
     researched `colorPalette`. **Correction (caught by Olga):** initially
     misread as having the same dark-vignette background problem as
     Round 1 — wrong. `sharp` metadata + raw pixel sampling confirm the
     OpenAI image has real `RGBA` alpha transparency (corner pixel
     `[0,0,0,0]`, frog-center pixel `[156,177,87,255]`, clean transition,
     no gradient) — the "vignette" was a rendering artifact of viewing a
     transparent PNG over a dark backdrop, not real pixel content.
     Round 1's identical "dark vignette/glow" claim about OpenAI is now
     suspect too, but unverifiable (original files gone). **Olga's
     verdict: OpenAI, same reason as Round 1** (sharper, reads as
     background-free without a removal step) — scored, running score now
     OpenAI 2 - Stability 0. Full writeup:
     `docs/genai-growth/IMAGE_GENERATION_PREFERENCES.md` Round 2.
   - **Built 2026-08-08 (same day): attempted fix for the grounding-gate
     failure above.** `buildPrompt()` used to end with "respond with ONLY a
     JSON object... no other text before or after it." Suspected cause:
     citation markup (what `assessGrounding()` actually reads) typically
     attaches to prose that directly references a search result, not to
     findings paraphrased into JSON field values — a structural side effect
     of the strict-JSON-only instruction, not evidence the model didn't
     really search. Changed to ask for a short cited paragraph (real URLs
     inline) BEFORE the JSON object. `extractJson()` needed no change — its
     regex already scans for a JSON object anywhere in the text, not just at
     the start. **Not yet confirmed to work** — citation attachment is the
     model's own behavior, not something an instruction can force; the next
     live `detectTrend()` run will show whether `distinctCitedUrls`
     actually improves. Verified: `tsc --noEmit` clean, Vitest 14/14 in
     `trend-detection.test.ts` (prompt-text change only, no schema change).
   - **Built 2026-08-08 (same day): `pattern-converter.ts` made alpha-aware
     — found and fixed a real bug on the live public site along the way,
     not just a Track 2 gap.** Started from Olga catching a real
     misdiagnosis: what I'd called a "vignette" on Round 2's OpenAI frog
     image was actually genuine `RGBA` alpha transparency (confirmed via
     `sharp` metadata + raw pixel sampling). Checking how `convertImage()`
     handles alpha surfaced something worse: `.removeAlpha()` doesn't
     composite onto any background — it just drops the alpha channel and
     keeps whatever RGB the encoder stored under transparent pixels (in
     this file's case, `[0,0,0]` — black). `convertImage()` is called
     directly from the public `/api/convert` route with no pre-flatten
     step, so **any real user who ever uploaded a PNG with genuine
     transparency (clipart, a sticker, a screenshot) got a black
     background in their pattern instead of white** — a live product bug,
     unrelated to Track 2, found as a side effect of this investigation.
     Fixed: new `compositeOntoWhite()`/`decodeComposited()` helpers
     (`ensureAlpha()` — a safe no-op for already-opaque images — then
     composite straight alpha onto white in JS), replacing both
     `.removeAlpha()` call sites (main resize + the flat-art-mode
     full-resolution outline-detection pass). Transparent cells are
     tracked and excluded from k-means sampling, the per-DMC pixel tally,
     and the final palette/grid build, becoming empty stitches (`-1`,
     the same sentinel already used for erased cells everywhere else)
     instead of a spurious "white" color competing for a `maxColors`
     slot — no border flood-fill guessing needed for images with real
     alpha. **Verified against real images, not synthetic tests** (this
     file has no unit tests — verified via real converted images,
     matching its established practice): the real transparent OpenAI frog
     (3340/6400 cells correctly empty, palette has no phantom background
     color, all 16 colors are genuine frog tones) and a real opaque image,
     the Stability frog (0 empty cells, same full-grid behavior as
     before — confirms zero regression for the overwhelming majority of
     uploads, which have no alpha channel). `tsc --noEmit` clean,
     `next lint` clean, Vitest 89/89 unchanged. Resolves `OPPORTUNITIES.md`
     Opportunity 9's "Cause A" open question. **Not yet deployed** — this
     fixes `/api/convert` on the live site too, not just Track 2, so it's
     worth deploying on its own rather than only as part of a future
     Track 2 release.
   - **Second real end-to-end draft save, 2026-08-08 — the frog, through
     the now-alpha-aware pipeline.** `save-ai-draft.ts` stopped
     pre-flattening to white before calling `convertImage()` (that step
     would have destroyed the real alpha data the new alpha-aware code
     needs — caught before it became a real bug); `detectBackgroundByFloodFill`/
     `eraseBackground` kept as a fallback for non-alpha sources, confirmed
     harmless no-op-if-already-blanked for alpha sources (flood-fill starts
     from the border, which is already `-1`, so it can't expand). Real run
     on the OpenAI frog PNG: alpha-aware `convertImage()` → 105x105/15
     colors, flood-fill fallback still caught 416 residual near-white
     antialiased edge cells (real, expected — semi-transparent border
     pixels above the alpha threshold composite close to white, this is
     exactly the "mop up the leftover halo" case the fallback exists for),
     Size to Design → 84x84, Remove Unused → 8 final colors. Saved to
     Olga's account as pattern `039afa9b-4bef-4b15-9db7-c884b232733a`
     ("Kawaii Cottagecore Frog"), `AiDesignGenerations` row
     `e643af72-4eaf-45e9-b3a5-086a7476421e` tracks the full provenance
     (theme, imagePrompt, targetWidth/targetHeight/colorPalette,
     grounding). Rendered thumbnail confirmed visually clean: correct
     colors (green/cream/pink matching the researched `colorPalette`),
     genuinely empty background (real Aida texture, not a white blob) —
     first real visual confirmation the alpha fix works end-to-end, not
     just in isolated pixel-count checks.
   - **Real production incident, 2026-08-08 — every AI-draft pattern
     became unloadable right after the admin review UI deployed; found
     and fixed live, within the hour.** Olga resized the frog draft in
     the editor; Save showed no feedback at all; a page reload then
     showed "Failed to load Pattern." Root-caused via a real
     authenticated request against the live API (not guessed):
     `GET /api/converter/patterns/[id]` returned `500
     {"error":"Failed to load pattern"}`, while the exact same
     `loadPattern`/`getGeneration` calls succeeded when run locally
     against the same production DynamoDB tables — pointing at an
     environment difference, not a data or logic problem. Checked
     `aws-elasticbeanstalk-ec2-role`'s inline `CrossStitchDynamoDBAccessPolicy`
     (`aws iam get-role-policy`): it's a manual per-table allowlist, and
     `AiDesignGenerations`/`AiDesignCorrections` were never added when
     those tables were built earlier today — `ensureTable()`
     self-provisions the table but grants the EB role no IAM access to
     it. **Same failure category as the 2026-08-04/05
     `CrossStitchBusinessHistory` incident** — worth remembering as a
     standing rule: a new self-provisioning DynamoDB table needs an
     explicit grant added to this policy before its first production
     deploy. Fixed with Olga's explicit go-ahead (IAM edits always need
     confirmation first, per standing rule): `aws iam put-role-policy`
     adding both tables (+ their `/index/*`) to the existing
     `DescribeTable`/`CreateTable`-capable statement (mirroring the other
     self-provisioning tables already there — `SearchEngagement`,
     `ConverterCatalogProgress`, etc.). Verified live immediately after:
     the same authenticated request now returns `200` with real pattern
     data.

     **Two real code bugs found and fixed alongside the IAM root cause,
     both worth keeping regardless of the specific incident:**
     1. `GET .../patterns/[id]`'s `getGeneration()` call (added today for
        `needsAiReview`) wasn't isolated — any failure in that ancillary
        status check took down the entire pattern load with a generic
        500, even though the actual pattern data was completely fine.
        Now wrapped in its own try/catch, defaulting `needsAiReview` to
        `false` and logging on failure, so a future problem with
        `AiDesignGenerations` degrades gracefully instead of blocking
        every AI-draft pattern from loading at all.
     2. `ConvertClient.tsx`'s `handleSave()` had `.catch(() => {})` on
        the re-save path — any non-401 failure (validation error, server
        error, this IAM error) vanished with zero feedback: no toast, no
        modal, nothing. This is exactly why "no dialog appeared" even
        though Save was genuinely failing. Now shows a `Save failed: …`
        toast for any error that doesn't already have its own visible
        feedback (401 still silently defers to the register-modal path,
        via an explicit `{ silent: true }` flag already set there).

     Verified: `tsc --noEmit` clean, `next lint` no new warnings
     (5 pre-existing), Vitest 89/89. **Deployed** — see the deploy
     record below.
   - **Built the same day, foundation piece of the provenance/correction
     schema (`DESIGN_FEEDBACK_LOOP.md`'s "Data store and provenance
     tracking"):** `AiDesignGenerations` table + service
     (`web/src/lib/ai-design-generations.ts`), `sourceGenerationId` added
     to `ConverterPatterns`, both wired into `save-capybara-draft.ts` via
     a new optional `[generationMetaPath]` arg. Verified with a real
     create → attachDraft → getGeneration round-trip against live AWS —
     grid/palette RLE round-trips correctly, status transitions
     `generated` → `draft-saved`.
   - **Built the same day, second increment:** `AiDesignCorrections` table
     + service (`web/src/lib/ai-design-corrections.ts`) — pure, unit-tested
     `diffPatterns()`/`isEmptyDiff()` (5 tests; compares by resolved DMC
     number per cell so a palette reorder alone isn't a spurious diff;
     handles a resize by reporting `dimensionsChanged`/`cellsChanged: null`
     instead of a meaningless positional compare) plus `reviewGeneration()`
     — the actual server-side diff orchestration: fetches the snapshot,
     diffs it, writes the correction row, calls `markReviewed()` (first
     real caller of that function). Verified with a real
     `createGeneration → attachDraft → reviewGeneration → getGeneration`
     round-trip against live AWS.
   - **Built 2026-08-08 (later same day): the API route + editor UI.**
     `GET .../patterns/[id]` now returns `needsAiReview`; new
     `POST .../patterns/[id]/review` calls `reviewGeneration()` via the
     two-call protocol (empty diff auto-finalizes; non-empty diff returns
     unpersisted for the UI, second call submits `reasonTags`/
     `freeTextComment`). `ConvertClient.tsx` shows an "AI-draft" badge, a
     "✓ Approve" button, auto-triggers review right after Save on an
     unreviewed draft, and a reason-tag modal. **Admin-only by design** —
     every one of those UI elements is gated behind `isAdmin` (same
     boundary the existing "Publish to Catalog" button uses), because this
     isn't a user-facing feature at all: it exists to let Olga train the
     AI generation pipeline itself (accumulate her real corrections toward
     Level 1/2/3 of the feedback loop), not to let ordinary users generate
     or approve designs. A regular user never has an `AiDesignGenerations`
     row to review. Verified: `tsc --noEmit` clean, `next lint` no new
     warnings, Vitest 79/79. Full detail in `DESIGN_FEEDBACK_LOOP.md`.
   - **Real usage caught a real design gap, 2026-08-08 — the one-shot
     review flow was wrong, changed to multi-round.** Olga made a real
     second edit to the frog draft after her first Approve-with-changes
     and got no dialog at all — by design at the time
     (`AiDesignGenerations.status` flips `draft-saved` → `reviewed` after
     round 1, and `needsAiReview` only fires on `draft-saved`), but wrong
     for how she actually wants to use it: **every save on an AI-draft
     should offer review, each one its own round.** Changed: `submitReview()`
     no longer calls `markReviewed()` (kept as an unused-for-now building
     block, not deleted) — `status` stays `draft-saved` permanently for
     this purpose, so `needsAiReview` keeps firing on every future save.
     New `AiDesignGenerations.lastReviewedGrid`/`lastReviewedPalette`
     (`recordReviewRound()`, called after every submitted review, not
     just the first) hold the end-state of the most recently completed
     round; `computeDiffForGeneration()` now diffs against this (falling
     back to the immutable `initialGrid`/`initialPalette` only for round
     1) instead of always against the original AI output — otherwise
     round 2's diff would show the cumulative change since generation,
     not just what changed in round 2, misrepresenting what Olga actually
     did in that round. New `AiDesignCorrection.roundNumber` (1, 2, 3, ...)
     makes the sequence explicit. **Backfilled the frog's existing
     generation** (`e643af72-4eaf-45e9-b3a5-086a7476421e`) — round 1 was
     recorded under the old code before `lastReviewedGrid` existed, so
     without a one-time backfill round 2 would have incorrectly diffed
     against the original 84x84/8-color snapshot instead of round 1's
     60x60/5-color outcome. Verified live: after backfilling,
     `computeDiffForGeneration()` against the pattern's current
     (unchanged since round 1) state correctly returns an empty diff —
     confirms the new baseline is right, not just that the code runs.
     `tsc --noEmit` clean, `next lint` clean, Vitest 89/89 unchanged (all
     I/O, no new pure logic to unit-test). **Not yet deployed.**

## Constraints
- Product development must not be slowed unnecessarily for teaching.
- Production AI code stays in normal application folders/services.
- Do not claim production GenAI experience until features are actually deployed.
- Do not introduce heavy agent frameworks prematurely.

## Status Legend
- NOT STARTED
- LEARNING
- IMPLEMENTED
- DEPLOYED
- PRODUCTION VALIDATED
