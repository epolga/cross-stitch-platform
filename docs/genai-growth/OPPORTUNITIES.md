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
