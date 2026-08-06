# GenAI Engineering Roadmap

This roadmap is dynamic. Product value has priority over following phases mechanically.

## Phase 0 — Repository and Architecture Review
Inspect frontend/backend structure, AWS infrastructure, databases, authentication, catalog/search, editor, image-to-pattern conversion, Stitch Mode, analytics/monitoring, CI/CD, deployment, and existing AI-related functionality.

**Output:** architecture summary and initial opportunity inventory.

## Phase 1 — Production Python Service
**Scope decided 2026-08-06 (ADR-006), after Phase 0 found that natural-
language search (Opportunity 1) and semantic/hybrid search (Opportunity 2)
are already live in production — in Node.js, not Python
(`web/src/app/api/ai-search/route.ts`, `web/src/lib/semantic-search.ts`).
Phase 1 does NOT re-implement that search in Python.** Instead it builds
the next real increment the existing search doesn't have yet: most likely
a real vector database to replace the current flat-file/S3 brute-force
index (`embeddings/vectors.json`), and/or retrieval evaluation against the
already-accumulating `SearchQueries` DynamoDB log. Exact scope (vector DB
choice, integration point with the existing Next.js app) still to be
nailed down — see `PROGRESS.md` Next Actions. The existing Node search
keeps serving production traffic unchanged throughout.

**Internally staged by learning complexity (ADR-007, 2026-08-06)** — not
one big jump straight to the full feature:
1. Bare FastAPI skeleton: one health-check endpoint, one `pytest` test, runs locally.
2. Pydantic request/response models.
3. The actual feature (vector DB client, embeddings, retrieval evaluation) on top of the understood skeleton.
   **Before starting Step 3, re-decide whether a real vector database is
   actually justified yet (discussed with Olga 2026-08-06):** at the
   current catalog size (~5,271 designs, ~50MB of vectors), the existing
   brute-force flat-file approach is technically adequate and costs
   essentially $0 extra. A dedicated vector DB's realistic cost floor is
   disproportionate to that data size — ballpark, not precise, check
   current AWS pricing before deciding: Amazon OpenSearch (managed
   cluster) ~$50-150+/mo minimum; OpenSearch Serverless ~$500-700+/mo
   minimum (its OCU floor bills regardless of actual load — a known
   expensive trap at small scale); Aurora Serverless v2 + pgvector
   ~$20-50/mo, likely the cheapest AWS-native floor, can scale down close
   to idle; managed third-party (Pinecone/Weaviate/Qdrant) free tier ~$0
   but leaves the single-AWS-account setup entirely. **Default lean:
   retrieval evaluation is the more clearly justified Step 3 target right
   now — it needs no new paid infrastructure, works against data already
   accumulating in `SearchQueries`, and produces a measurable
   before/after number.** Revisit the vector-DB migration once catalog
   growth or measured query latency actually demands it, not
   preemptively.

**Real milestone (not just "service exists"):** Olga has no prior Python
experience (C#/.NET background) — see `Learning.md` § Python Background.
Phase 1 is only satisfied when Olga can independently read, modify, and
debug this Python/FastAPI code herself, not merely when it is deployed.

**Skills:** Python, typing, async/await, FastAPI, Pydantic, pytest, configuration, logging, secrets, API integration, embeddings, vector databases, retrieval evaluation.

## Phase 2 — Natural-Language Pattern Search
**Already shipped in Node.js as of Phase 0 review (2026-08-06)** —
`web/src/app/api/ai-search/route.ts`, live via `HeroSearch.tsx`. This phase
is not "build from scratch"; it's now an upgrade-in-place candidate (real
structured-output/tool-calling API instead of regex JSON extraction) if
ever revisited — not currently scheduled work.

Example: “Find me a realistic black cat pattern under 120 stitches wide with no more than 20 colors.”

The LLM converts intent into structured criteria. Existing deterministic search/filtering handles exact constraints.

**Skills:** LLM APIs, structured output, schemas, prompt design, validation, retries, timeouts, latency/cost awareness.

## Phase 3 — Semantic / Hybrid Catalog Search
**Already shipped in Node.js as of Phase 0 review (2026-08-06)** —
`web/src/lib/semantic-search.ts` (Bedrock Titan embeddings, flat-file
brute-force ranking). **Phase 1's actual scope (ADR-006) is this phase's
next increment**, done in Python: a real vector database and/or retrieval
evaluation. Kept as a separate phase entry here for the skill list below;
in practice it now happens as part of Phase 1, not after it.

Support conceptual queries such as “Something cozy for a kitchen but not flowers.”

**Skills:** embeddings, vector search, metadata, hybrid retrieval, ranking, reranking, retrieval evaluation.

## Phase 4 — RAG Support Assistant
Answer questions about the site/editor using actual documentation and citations.

**Skills:** ingestion, chunking, embeddings, retrieval, context construction, grounding, citations, hallucination control, retrieval evaluation.

## Phase 5 — Tool Calling
Allow the assistant to safely use application capabilities such as search, pattern metadata, user projects, palette/statistics, and editable-copy creation.

**Skills:** tool schemas, tool selection, argument validation, permissions, execution boundaries, retries.

## Phase 6 — Editor Agent
Support carefully controlled high-level editor operations with preview/confirmation before mutations.

**Skills:** agent state, read-only vs mutating tools, authorization, confirmation boundaries, idempotency, rollback/undo.

## Phase 7 — Multi-Step Agentic Workflows
Support tasks requiring several decisions/actions.

**Skills:** agent loops, state machines, planning vs execution, retries, termination criteria, deterministic workflow vs LLM decisions.

## Phase 8 — Multi-Agent Architecture, Only If Justified
Potential specialists: Search, Conversion, Editor, Support/RAG, Coordinator.

Do not introduce multiple agents solely to demonstrate the technology.

## Phase 9 — Automated GenAI Evaluation
Track relevant metrics such as retrieval accuracy, correct-tool rate, invalid tool calls, task completion, factuality failures, latency, token usage, and model cost.

## Phase 10 — Production AI Reliability
Docker, CI/CD, health checks, deployment, structured logging, metrics, traces, auth, authorization, secrets, rate limits, retries, timeouts, cost monitoring, rollback.

Potential CI flow:
code tests → integration tests → AI evals → build → deployment

## Candidate High-Value Product Features
1. Natural-language catalog search
2. Semantic/hybrid pattern discovery
3. RAG editor/site assistant
4. AI-assisted conversion setting recommendations
5. Tool-calling catalog assistant
6. Palette simplification assistant
7. Stitching companion using Stitch Mode state
8. Multi-step discovery → conversion workflow

## Current Recommended Sequence
1. Architecture review
2. Production Python/FastAPI service
3. Structured natural-language search
4. Semantic/hybrid search
5. RAG support assistant
6. Tool calling
7. Editor agent
8. Evals
9. Advanced agentic workflows
10. Multi-agent only if justified
