# GenAI Initiative Session Log

Keep this concise. Record milestones, important discoveries, failures, decisions, and next steps — not every command or minor code edit.

## 2026-08-05 — Initiative Defined

### What changed
- Established a parallel GenAI engineering initiative for Cross-Stitch.com.
- Chose development-first / learning-in-parallel model.
- Decided to keep growth documentation under `docs/genai-growth/`.
- Defined proactive opportunity discovery and evidence-based skills tracking.
- Defined initial roadmap from Python/FastAPI through structured LLM output, semantic search, RAG, tool calling, agents, evals, and production observability.

### Current state
No new GenAI production implementation has been started under this initiative yet.

### Important decisions
- Product remains primary.
- Production AI code stays in normal application architecture.
- Claude should proactively suggest useful AI opportunities.
- Skills must be tracked by concrete evidence.
- Heavy orchestration frameworks should not be introduced prematurely.

### Next likely step
Olga confirmed 2026-08-05: start Phase 0 (Repository and Architecture Review)
on 2026-08-06 morning. Inspect the repository and identify:
1. actual current architecture;
2. current catalog/search structure;
3. best location for a Python/FastAPI service;
4. smallest useful first AI feature.

## 2026-08-06 — Python discrepancy resolved; Phase 0 architecture review done

### What changed
- Resolved the local Python version discrepancy (`python` 3.13.2 vs `py`
  3.13.14): removed a Microsoft Store Python package that had registered
  itself in `HKCU` (which the `py` launcher prefers per PEP 514, over the
  python.org installer's `HKLM` registration). Both commands now agree on
  `C:\Python313\` 3.13.2 with one shared pip/site-packages.
- Ran Phase 0 (Repository and Architecture Review). Output:
  `docs/genai-growth/ARCHITECTURE_SUMMARY.md` — covers catalog/search,
  image-to-pattern conversion, editor, Stitch Mode, existing AI
  functionality, auth, and analytics/monitoring/CI/CD, each grounded in
  real file paths, cross-referencing rather than duplicating existing docs
  (`docs/AWS-Services-Overview.md`, `docs/web/platform-architecture-summary.md`,
  `docs/integration/dynamodb-schema.md`).

### What was learned / discovered
- **Opportunities 1 and 2 are already shipped**, not candidates:
  natural-language search (`web/src/app/api/ai-search/route.ts`, Claude
  Opus, regex-extracted JSON — no structured-output API) and
  semantic/hybrid search (`web/src/lib/semantic-search.ts`, Bedrock Titan
  multimodal embeddings, brute-force dot-product over a flat JSON file in
  S3, not a real vector DB) are both live on the homepage via
  `HeroSearch.tsx`, combined through a working hybrid-ranking merge in
  `data-access.ts`.
- A working **agentic tool-use loop** already exists:
  `automation/pinterest-agent/src/services/aiToolsScan.ts` uses Claude's
  server-side `web_search` tool, handles `pause_turn` continuation, and
  has a documented `MAX_SEARCH_USES` cap learned from a prior
  `max_uses_exceeded` failure — solid prior art for Phase 5/7 tool-calling
  design.
- Opportunity 4's plug-in point is `web/src/lib/image-analysis.ts`
  (`analyzeImage()`) — a hand-tuned heuristic classifier with no AI call
  today, feeding `ImportFromPhotoDialog.tsx`'s mode suggestion.
- Opportunity 6 (palette simplification) is confirmed genuinely greenfield
  — no merge/simplify logic exists anywhere in the editor.
- `docs/web/converter-functionality.md` is stale — predates the
  LAB/CIEDE2000/k-means/outline-detection rewrite of `pattern-converter.ts`.

### Correction (same day)
- The review's first pass wrongly claimed Stitch Mode progress
  (`stitchedCells`) isn't persisted server-side — Olga caught this
  ("мне казалось, что прогресс сохраняется"). Checked the code: it is
  saved, via `pattern-storage.ts`'s dedicated `saveProgress()` function and
  `progress` attribute (RLE-encoded, kept separate from the main
  grid/palette save so marking a cell is cheap), pushed by a debounced
  `PUT /api/converter/patterns/{id}/progress` (or the catalog-pattern
  equivalent) from `ConvertClient.tsx`, and reloaded into `stitchedCells`
  on pattern open. Fixed in `ARCHITECTURE_SUMMARY.md` and `OPPORTUNITIES.md`
  Opportunity 7. Lesson: a background review agent's cited file paths and
  model names being real doesn't mean its functional claims are — verify
  the specific claim, not just that the files it points to exist.

### Decisions
- None yet — Phase 1 reframing (port the working Node search to Python as
  the teaching vehicle vs. build a from-scratch service) is a decision for
  Olga, presented but not made this session.

### New opportunities
- No new opportunity line added — a candidate "image search" opportunity
  turned out to reuse Opportunity 2's exact embedding infrastructure
  (`web/src/app/api/image-search/route.ts`), folded into Opportunity 2's
  notes instead of duplicating.

### Current state
`OPPORTUNITIES.md` and `PROGRESS.md` updated to reflect the above.
`ROADMAP.md` not yet edited — reframing recommendation is pending Olga's
input.

### Next likely step
Discuss Phase 1 reframing with Olga (port existing search to Python vs.
build the next real increment vs. an unrelated first feature); once
decided, scope Phase 1 concretely and update `ROADMAP.md`.

## 2026-08-06 (cont.) — Phase 1 Step 1 built; vector-DB cost/timing discussed

### What changed
- Built Phase 1 Step 1: `search-service/` (new top-level folder), a
  `.venv`, FastAPI + uvicorn + pytest + httpx installed, one `/health`
  endpoint (`app/main.py`), one passing `pytest` test
  (`tests/test_health.py`), proven both via `pytest` and a real
  `uvicorn` run hit with `curl`.
- Walked through Learning Checkpoints on venv vs NuGet, decorators vs C#
  attributes, type hints vs enforced typing, and — on request — a deep
  dive on embeddings/vectors, vector databases vs the current brute-force
  approach, and retrieval evaluation metrics (Precision@k, Recall@k, MRR,
  NDCG), grounded in the real code (`semantic-search.ts`, 1024-dim Titan
  vectors per `generate-embeddings.ts:131`).
- Olga asked for a rough cost estimate for a real vector DB. Discussed
  ballpark figures (not precise — check current AWS pricing before
  deciding): current brute-force approach ~$0 extra; Amazon OpenSearch
  managed cluster ~$50-150+/mo; OpenSearch Serverless ~$500-700+/mo floor
  (OCU minimum, a known trap at small scale); Aurora Serverless v2 +
  pgvector ~$20-50/mo (likely cheapest AWS-native option); managed
  third-party (Pinecone/Weaviate/Qdrant) free tier ~$0 but leaves the
  single-AWS-account setup.

### Decisions
- Documented in `ROADMAP.md` Phase 1 Step 3: re-decide whether a vector
  DB is actually justified before building it, not preemptively. Default
  lean is retrieval evaluation as the more clearly justified Step 3
  target (no new paid infra, works off the already-accumulating
  `SearchQueries` log) — revisit the vector DB once catalog growth or
  measured latency actually demands it.

### Current state
`search-service/` exists with a working skeleton, not yet committed to
git (per project rule: never commit without being asked). Step 2
(Pydantic models) not yet started.

### Next likely step
Step 2: Pydantic request/response models for the FastAPI skeleton — or,
given the Step 3 discussion above, consider whether Step 3 should target
retrieval evaluation specifically rather than a generic "vector DB
client" placeholder.

## Session Entry Template
### YYYY-MM-DD — [Short title]

**What changed**
- 

**What was learned / discovered**
- 

**Problems / failures**
- 

**Decisions**
- 

**New opportunities**
- 

**Current state**
- 

**Next likely step**
- 
