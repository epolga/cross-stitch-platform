# GenAI Product Opportunities

This is a living backlog. Claude should proactively add opportunities discovered while working on the real product.

## Evaluation Scale
- Product Value: 1–5
- GenAI Skill Value: 1–5
- Complexity: 1–5
- Operational / Cost Risk: Low / Medium / High

## Opportunity 1 — Natural-Language Pattern Search
**Status:** **ALREADY IMPLEMENTED AND DEPLOYED** (found during Phase 0 architecture review, 2026-08-06) — contradicts the prior CANDIDATE rating; see Notes below before treating this as unstarted work.
**Problem:** Users may know what they want but not the exact catalog category/title/tags/filters.  
**Capability:** Convert natural language into validated structured criteria, then use existing deterministic catalog search/filtering.  
**Product Value:** 5/5  
**GenAI Skill Value:** 4/5 — downgrade the *remaining* skill value, since the core capability already exists; remaining skill value is mainly in a Python port or an upgrade (real structured-output API instead of regex-extracted JSON, validation, retries).
**Complexity:** 2/5  
**Risk:** Low–Medium  
**Existing Components to Reuse:** `web/src/app/api/ai-search/route.ts` (Claude `claude-opus-4-8`, system prompt extracts `{searchText, widthFrom/To, heightFrom/To, ncolorsFrom/To}` as JSON via regex match — no structured-output/tool-calling API used, a clear upgrade target); `web/src/lib/data-access.ts` `fetchFilteredDesigns()` (the deterministic filter layer it feeds); `web/src/app/components/HeroSearch.tsx` (UI, runs this in parallel with Opportunity 2's semantic search); `web/src/lib/search-log.ts` → `SearchQueries` DynamoDB table (existing query log, ready-made eval dataset).
**Skills:** Python, FastAPI, LLM API, structured output, schemas, prompt design, validation.  
**Timing:** Not "first implementation after architecture review" — already shipped in Node.js. Next timing decision is whether/when to port to Python (Phase 1 teaching vehicle) or upgrade in place (structured-output API, validation, retries) — recommend discussing with Olga before Phase 1 scoping.
**Notes / Evidence:** Full findings in `docs/genai-growth/ARCHITECTURE_SUMMARY.md` §1. Live on the homepage via `HeroSearch.tsx` today, 2026-08-06.

## Opportunity 2 — Semantic / Hybrid Catalog Search
**Status:** **ALREADY IMPLEMENTED AND DEPLOYED** (found during Phase 0 architecture review, 2026-08-06) — contradicts the prior CANDIDATE rating; see Notes below.
**Problem:** Keyword search may fail for conceptual queries.  
**Capability:** Embeddings + vector search combined with deterministic metadata filters.  
**Product Value:** 5/5  
**GenAI Skill Value:** 4/5 — downgrade slightly: embeddings + hybrid retrieval + ranking already exist and work; remaining skill value is in reranking, retrieval evaluation, and replacing the flat-file brute-force index with a real vector DB if/when catalog size demands it.
**Complexity:** 3/5  
**Risk:** Medium  
**Existing Components to Reuse:** `web/src/lib/semantic-search.ts` (AWS Bedrock `amazon.titan-embed-image-v1` multimodal embeddings; brute-force dot-product ranking over an in-memory `Map` loaded from a flat JSON file — **not a real vector database**, worth noting as a scaling limit, not a flaw at current catalog size of ~5,271 designs); `automation/pinterest-agent/scripts/generate-embeddings.ts` (offline batch embedding generation, image+text vectors weighted 0.75/0.25 elsewhere, ~$0.35 total cost for the full catalog); S3 `cross-stitch-sitemap-cache/embeddings/vectors.json` (the vector store itself); `web/src/lib/similar-designs.ts` (a related precomputed-similarity consumer of the same embeddings, via `embeddings/similar-designs.json`); hybrid merge logic in `data-access.ts` `fetchFilteredDesigns()` lines 580-602 (text-as-hard-filter + semantic-as-reranker, or semantic-only ranking).
**Skills:** embeddings, vector DB, hybrid retrieval, ranking, reranking, retrieval evaluation.  
**Timing:** Already shipped. Next natural increment: retrieval evaluation using the accumulating `SearchQueries` log, and/or migrating off the flat-file index to a real vector DB if catalog growth or latency demands it — not urgent today.
**Notes / Evidence:** Full findings in `docs/genai-growth/ARCHITECTURE_SUMMARY.md` §1. A closely related **image search** capability (upload a photo → Claude vision description → same semantic search) also already exists at `web/src/app/api/image-search/route.ts`, not previously tracked as its own opportunity line — folding it under this one rather than adding a duplicate entry, since it reuses the identical embedding infrastructure.

## Opportunity 3 — RAG Editor / Site Assistant
**Status:** CANDIDATE  
**Problem:** Users may not understand editor functions or conversion behavior.  
**Capability:** Retrieve from actual documentation and answer with grounded citations.  
**Product Value:** 3/5  
**GenAI Skill Value:** 5/5  
**Complexity:** 3/5  
**Risk:** Low–Medium  
**Skills:** RAG, ingestion, chunking, retrieval, citations, evaluation.

## Opportunity 4 — AI-Assisted Conversion Settings
**Status:** CANDIDATE — PROMISING (unchanged — the underlying analyzer is deterministic today, not AI; see reuse paths)
**Problem:** Users may not know which conversion parameters fit a photo, line art, illustration, or desired result.  
**Capability:** Use existing image analysis/type detection plus structured AI reasoning to recommend settings.  
**Product Value:** 5/5  
**GenAI Skill Value:** 4/5  
**Complexity:** 3/5  
**Risk:** Medium  
**Existing Components to Reuse:** `web/src/lib/image-analysis.ts` `analyzeImage()` — the exact plug-in point. Currently pure heuristics (bimodal luminance histogram, mean saturation, Sobel edge density, 8×8 color-bucket diversity, flat-pixel-pair fraction) classifying `photo | line-art | typography | illustration` with a confidence level and warnings — no AI call today, and the in-code comments describe two rounds of manual recalibration against real examples, i.e. a plausible AI upgrade target. Exposed via `POST /api/analyze`; consumed by `web/src/app/components/ImportFromPhotoDialog.tsx` (`imageTypeToMode()` maps the classification to a suggested `ConversionMode` + minimum width, user can override). The deterministic conversion pipeline this would feed settings into is `web/src/lib/pattern-converter.ts` (k-means in LAB space, CIEDE2000 DMC matching, outline preservation for line-art/illustration mode) — keep that deterministic per Learning.md's architecture principle; only the classification/recommendation step is a sensible LLM target, not the color math itself.
**Skills:** structured output, recommendation logic, evaluation, possibly tool calling later.

## Opportunity 5 — Tool-Calling Pattern Assistant
**Status:** FUTURE  
**Capability:** Conversationally search patterns, inspect details, create editable copies, and navigate workflows through controlled tools.  
**Product Value:** 4/5  
**GenAI Skill Value:** 5/5  
**Complexity:** 3/5  
**Risk:** Medium

## Opportunity 6 — Palette Simplification Assistant
**Status:** FUTURE (confirmed genuinely greenfield — no existing merge/simplify logic found)
**Problem:** Generated patterns may contain many visually similar colors.  
**Capability:** Inspect palette/statistics, propose merges, preview, confirm, then apply through deterministic code.  
**Product Value:** 4/5  
**GenAI Skill Value:** 5/5  
**Complexity:** 4/5  
**Risk:** Medium
**Existing Components to Reuse:** No palette-merge/simplification feature exists anywhere in the editor today (checked `web/src/app/photo-to-cross-stitch/ConvertClient.tsx` and `web/src/app/components/PaletteBar.tsx` — no merge/reduce logic). What *does* exist to build on: the `PatternPalette[]` data shape (DMC number/name/RGB/symbol/stitchCount) from `web/src/lib/pattern-converter.ts`, the LAB-space color-distance functions already in that file (`labDist2`, `ciede2000`) which are exactly the right tool for "how visually similar are these two palette colors," and the existing 50-step undo/redo stack in `ConvertClient.tsx` which any deterministic merge-apply step should integrate with rather than bypass. `web/src/lib/pattern-storage.ts` is where a merged palette would ultimately get saved.

## Opportunity 7 — AI Stitching Companion
**Status:** FUTURE / EXPERIMENTAL
**Problem:** Help users make progress while stitching.  
**Examples:** “Where are the remaining stitches of DMC 310?” / “I have 20 minutes. Suggest a convenient small area to finish.”  
**Product Value:** 4/5  
**GenAI Skill Value:** 4/5  
**Complexity:** 4/5  
**Risk:** Medium
**Existing Components to Reuse:** Stitch Mode already exists as a mode within the converter editor (not a separate page) — `web/src/app/photo-to-cross-stitch/ConvertClient.tsx`, state `stitchMode` (toggle) + `stitchedCells` (`Set<string>` of `"row,col"`, ~lines 458-464, 1045-1066, 2407-2429), gated behind login via a register-modal prompt for guests. Live per-color remaining-stitch counts (`liveCounts`) already exist client-side — exactly the data a companion would answer "where are my remaining DMC 310 stitches" from. **Progress is already durable**: `web/src/lib/pattern-storage.ts`'s `saveProgress()` + the `progress` attribute (RLE-encoded, debounced `PUT /api/converter/patterns/{id}/progress` or the `catalog-pattern/{designId}/progress` equivalent) persist `stitchedCells` per pattern and reload it on open — no prerequisite gap here (an earlier pass of this review incorrectly claimed one; corrected 2026-08-06).
**Skills:** project state, tools, agent workflows, personalization.

## Opportunity 8 — On-Demand Catalog Translation (Lazy, Cached)
**Status:** CANDIDATE — HIGH PRIORITY (validated by real traffic data, 2026-08-05)
**Problem / User Need:** The catalog (5271 designs) and site are English-only.
GA4 (30-day window, checked 2026-08-05) shows several major non-English-
speaking markets already engaging with the English-only content at rates
comparable to or *higher* than native English-speaking countries: Portugal
76%, Germany 68%, Türkiye 67%, Netherlands 65%, Spain 65%, Italy 64%,
Poland 64%, Brazil 61%, France 59% engagement rate, vs. US 52%, Canada 65%,
Australia 67%, UK 68% — genuine, validated demand, not bot noise (contrast
with confirmed bot-signature countries like China at 10% engagement).
Translating the whole catalog upfront isn't realistic at this size.
**Proposed Capability:** When a design page is opened by a visitor whose
detected language isn't English, translate that design's short description
text on the fly, serve it immediately, and cache the result (e.g. a
DynamoDB table keyed by designId+locale, self-provisioning like
`blog-reactions.ts`/`editor-events.ts`). Coverage fills in organically,
proportional to actual traffic per design/locale, instead of one huge
upfront batch job.
**Why AI is appropriate:** Natural-language translation of short marketing/
descriptive copy is a standard strong LLM (or dedicated translation API)
use case.
**Could deterministic software be better?:** Worth comparing a plain
translation API (e.g. Google Cloud Translation) against an LLM call before
committing — the text is short and factual (not nuanced prose), so a
cheaper, more consistent deterministic MT service might be the better
first choice, with an LLM reserved only if plain MT quality proves
inadequate for specific languages.
**Existing Components to Reuse:** Design page structure; the AI SEO
description generation pipeline already built for Publish to Catalog;
DynamoDB self-provisioning table pattern.
**Product Value:** 4/5
**GenAI Skill Value:** 3/5
**Complexity:** 2/5 — scoped, incremental, cache-bounded, low technical risk
**Operational / Cost Risk:** Low–Medium. Cost scales with unique
(design × locale) pairs actually requested, bounded by the cache — not a
huge upfront translation bill. Main risk is low-quality/awkward machine
translation without native review; mitigated by scoping this to short
factual design blurbs only, **not** Ann's personal blog voice (keep that
English-only — Olga can't personally QA translated prose, and the voice/
tone risk is much higher there than for a factual product description).
**Relevant Skills:** LLM or translation-API integration, structured output,
caching/persistence design, locale/language detection.
**Recommended Timing:** Doesn't require the Phase 1 Python/FastAPI service
at all — could ship directly in the existing Next.js API routes as a
standalone early win, in parallel with (not blocking on) Phase 1.
**Notes / Evidence:** Full country engagement table and methodology in
session notes 2026-08-05 (GA4 `ga4-explore.ts --dimensions country
--metrics sessions,engagedSessions,pageviews`, 30-day window). Still to
scope: which locales to launch with, exact caching schema, language-
detection method (Accept-Language header vs. GSC-country-of-visit vs.
explicit user picker).

## Opportunity 9 — Automated Design Generation from Trending Themes
**Status:** CANDIDATE — HIGH PRIORITY, IN PROGRESS (Olga started this 2026-08-06)
**Problem / User Need:** Growing the catalog (currently 5,271 designs) currently requires manually sourcing/creating each design one at a time. Catalog growth is a stated driver of organic traffic/SEO (see `docs/Focus.md` and prior SEO session notes) — a bottleneck on catalog growth is a bottleneck on that traffic driver.
**Proposed Capability:** A pipeline: (1) detect a currently popular/trending theme via a web-search-capable LLM call; (2) generate a candidate source image for that theme via an image-generation model; (3) run it through the existing, mature `pattern-converter.ts` pipeline to produce a draft cross-stitch design; (4) Olga reviews/edits the draft; the system captures what changed and asks her targeted clarifying questions about *why*; (5) accumulate those answers into a growing, human-readable preference/style document that gets fed back into future generation prompts. Step 5 is explicitly **in-context learning / prompt-context accumulation, not model fine-tuning** — fine-tuning was considered and ruled out for now (needs hundreds+ of examples to work reliably, real training cost, catastrophic-forgetting risk, opaque/unauditable result vs. a plain document Olga can read and hand-edit) — see session discussion 2026-08-06.
**Why AI is appropriate:** Trend detection (open-ended research) and image generation are core generative-AI strengths with no good deterministic substitute. The actual cross-stitch conversion step stays fully deterministic — unchanged, existing `pattern-converter.ts` — consistent with `Learning.md`'s "deterministic code for deterministic responsibilities" principle.
**Could deterministic software be better?:** No for trend detection/image generation. The conversion step already correctly stays deterministic — this proposal doesn't touch that boundary.
**Existing Components to Reuse:** `web/src/lib/pattern-converter.ts` (the full, mature conversion pipeline — must NOT be reimplemented, see Language decision below); `automation/pinterest-agent/src/services/aiToolsScan.ts` (proven Claude + `web_search` pattern, directly reusable for trend detection); AWS Bedrock image-generation models (not yet used anywhere in this codebase — new integration, needs its own cost/quality evaluation before committing).
**Product Value:** 5/5 — directly grows the catalog, a stated driver of organic traffic.
**GenAI Skill Value:** N/A on the Python track specifically (see Language decision) — real skill value in LLM API integration, image generation, and prompt/context-engineering more generally.
**Complexity:** 4/5 — several new integrations at once (image-gen model, trend detection, diff/feedback capture, persistent preference-document storage, prompt-context accumulation).
**Operational / Cost Risk:** Medium (kept as-is 2026-08-06 — per-image cost is small, roughly $0.008-0.01/image for Titan Image Generator, $0.04-0.08/image for Stability AI on Bedrock, but Olga expects the initial exploration/tuning phase to be **open-ended experimentation, not a one-off comparison test** — generating "quite a few" images while understanding and polishing the pipeline/prompts, not a fixed small sample. Volume during that phase is unknown, so the rating stays Medium rather than being downgraded on steady-state-volume math alone; revisit once a model is picked and the process stabilizes).
**Image model choice — not yet decided (2026-08-06):** Olga wants to try both Amazon Titan Image Generator and Stability AI (Bedrock) before choosing, rather than picking by general reputation, and expects to generate a fair number of images during this exploration phase alone. The right comparison criterion for this pipeline isn't generic image quality/prompt-following — it's which produces images with **clean, well-separated color regions** that convert well through `pattern-converter.ts`'s k-means clustering (an overly photorealistic/noisy image would inflate the color count and produce messy outline detection, the same speckle/confetti problem noted in the 2026-08-04 outline-preservation work). Compare by running both models' output through the existing converter and checking resulting color counts / outline cleanliness — not a subjective art-quality judgment.
**Relevant Skills:** LLM API integration, image generation, prompt/context engineering, structured feedback capture, persistence design.
**Language decision (2026-08-06):** **Node.js/TypeScript, not Python.** This capability is heavily dependent on reusing `pattern-converter.ts` (deep, already-tuned color-science logic — LAB space, CIEDE2000, k-means, outline detection, built and refined over many prior sessions). Building it in Python would mean either an expensive, risky reimplementation of that logic, or an awkward cross-service network call from Python back into Node just to reach code that already lives there. **Likely doesn't need a separate service at all** — since it's Node.js calling Node.js code, it can most naturally live directly inside `web/` (new API route(s) + `web/src/lib/` functions), in-process, no new deployment, no network hop. This is a deliberate, separate decision from the parallel Python-learning initiative (`search-service/`, Phase 1 of `ROADMAP.md`), which continues independently — see `PROGRESS.md`/`SESSION_LOG.md` 2026-08-06 for the full reasoning.
**Recommended Timing:** Started 2026-08-06, running in parallel with Phase 1 Python work per Olga's decision — splitting working time between the two tracks rather than sequencing them. Actual work deferred to the next session (2026-08-06, late in a long day — Track 1's Step 3 deferred for the same reason).

**UX vision (proposed by Claude 2026-08-06, agreed by Olga, not yet implemented):** This is an internal/admin tool — end site visitors never see any part of the generation or review process, only the finished design appearing in the catalog like any other.
1. **Trigger** — not yet decided (a button in the admin/editor area, vs. fully automatic on a schedule proposing N candidates). Deliberately deferred: the trigger is a thin, swappable front end that doesn't change how the core pipeline is built, so it's safe to decide later without blocking implementation.
2. System runs the pipeline unattended: detect a trending theme → generate a candidate image → run it through `pattern-converter.ts` → produces a draft pattern, stored in the same shape as any pattern in `pattern-storage.ts`.
3. Olga opens the draft in the **existing** photo-to-cross-stitch editor (no new UI to build for editing itself) — likely with an "AI-draft" label distinguishing it from a normal saved pattern.
4. She edits with the same tools she already uses (palette, pencil, fill, etc.) — nothing new to learn.
5. On save/explicit "done reviewing," the system diffs the AI draft against her edited version and asks 1-2 targeted questions about specific changes (e.g. "You removed DMC 891 — too close to another red, or the wrong shade?"), surfaced in the editor UI itself, not a separate channel.
6. Publishing reuses the **existing, already-shipped** "Publish to Catalog" button/pipeline (2026-08-04/05) — Opportunity 9 does not reinvent publishing, only feeds a draft into it.
7. The preference document (§ Proposed Capability step 5 above) grows silently across sessions; over time drafts should need fewer corrections.
**Build-order decision (2026-08-06):** Build the core pipeline (steps 2-6 above) first; decide the exact trigger mechanism (step 1) later, once there's something real to trigger.

## Opportunity Template
### Opportunity — [Name]
**Status:**  
**Problem / User Need:**  
**Proposed Capability:**  
**Why AI is appropriate:**  
**Could deterministic software be better?:**  
**Existing Components to Reuse:**  
**Product Value:** /5  
**GenAI Skill Value:** /5  
**Complexity:** /5  
**Operational / Cost Risk:**  
**Relevant Skills:**  
**Recommended Timing:**  
**Notes / Evidence:**  
