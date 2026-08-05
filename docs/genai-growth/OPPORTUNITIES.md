# GenAI Product Opportunities

This is a living backlog. Claude should proactively add opportunities discovered while working on the real product.

## Evaluation Scale
- Product Value: 1–5
- GenAI Skill Value: 1–5
- Complexity: 1–5
- Operational / Cost Risk: Low / Medium / High

## Opportunity 1 — Natural-Language Pattern Search
**Status:** CANDIDATE — HIGH PRIORITY  
**Problem:** Users may know what they want but not the exact catalog category/title/tags/filters.  
**Capability:** Convert natural language into validated structured criteria, then use existing deterministic catalog search/filtering.  
**Product Value:** 5/5  
**GenAI Skill Value:** 4/5  
**Complexity:** 2/5  
**Risk:** Low–Medium  
**Skills:** Python, FastAPI, LLM API, structured output, schemas, prompt design, validation.  
**Timing:** First implementation after architecture review.

## Opportunity 2 — Semantic / Hybrid Catalog Search
**Status:** CANDIDATE — HIGH PRIORITY  
**Problem:** Keyword search may fail for conceptual queries.  
**Capability:** Embeddings + vector search combined with deterministic metadata filters.  
**Product Value:** 5/5  
**GenAI Skill Value:** 5/5  
**Complexity:** 3/5  
**Risk:** Medium  
**Skills:** embeddings, vector DB, hybrid retrieval, ranking, reranking, retrieval evaluation.  
**Timing:** After structured search.

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
**Status:** CANDIDATE — PROMISING  
**Problem:** Users may not know which conversion parameters fit a photo, line art, illustration, or desired result.  
**Capability:** Use existing image analysis/type detection plus structured AI reasoning to recommend settings.  
**Product Value:** 5/5  
**GenAI Skill Value:** 4/5  
**Complexity:** 3/5  
**Risk:** Medium  
**Skills:** structured output, recommendation logic, evaluation, possibly tool calling later.

## Opportunity 5 — Tool-Calling Pattern Assistant
**Status:** FUTURE  
**Capability:** Conversationally search patterns, inspect details, create editable copies, and navigate workflows through controlled tools.  
**Product Value:** 4/5  
**GenAI Skill Value:** 5/5  
**Complexity:** 3/5  
**Risk:** Medium

## Opportunity 6 — Palette Simplification Assistant
**Status:** FUTURE  
**Problem:** Generated patterns may contain many visually similar colors.  
**Capability:** Inspect palette/statistics, propose merges, preview, confirm, then apply through deterministic code.  
**Product Value:** 4/5  
**GenAI Skill Value:** 5/5  
**Complexity:** 4/5  
**Risk:** Medium

## Opportunity 7 — AI Stitching Companion
**Status:** FUTURE / EXPERIMENTAL  
**Problem:** Help users make progress while stitching.  
**Examples:** “Where are the remaining stitches of DMC 310?” / “I have 20 minutes. Suggest a convenient small area to finish.”  
**Product Value:** 4/5  
**GenAI Skill Value:** 4/5  
**Complexity:** 4/5  
**Risk:** Medium

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
