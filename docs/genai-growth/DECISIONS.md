# GenAI Architecture Decisions

## ADR-001 — Product development remains primary
**Status:** ACTIVE  
**Decision:** Product value remains the primary criterion. GenAI skill development happens through useful production features.

## ADR-002 — Separate GenAI growth documentation from production code
**Status:** ACTIVE  
**Decision:** Planning, progress, evidence, and opportunity tracking live under `docs/genai-growth/`. Production services/application code remain in normal project folders.

## ADR-003 — Development-first, learning-in-parallel
**Status:** ACTIVE  
**Decision:** Claude remains a full development agent. Teaching occurs through concise Learning Checkpoints around important new GenAI concepts and decisions.

## ADR-004 — Avoid heavy agent frameworks initially
**Status:** ACTIVE  
**Decision:** Begin with lower-level APIs for LLM requests, structured output, tool calling, state, error handling, and tracing. Reassess frameworks when orchestration complexity justifies them.

## ADR-005 — Prefer deterministic logic for deterministic tasks
**Status:** ACTIVE  
**Decision:** Authorization, validation, exact filtering, calculations, database constraints, state transitions, and deterministic operations stay ordinary code. LLMs handle semantic interpretation, retrieval-grounded reasoning, ambiguous intent, and appropriate tool selection.

## ADR-006 — Phase 1 builds the next real search increment in Python, not a port
**Status:** ACTIVE
**Decision date:** 2026-08-06 (Olga's call, after Phase 0 review)
**Problem:** Phase 0 found that Opportunities 1 (natural-language search) and 2 (semantic/hybrid search) are already built and live in production — but in Node.js/TypeScript (`web/src/app/api/ai-search/route.ts`, `web/src/lib/semantic-search.ts`), not Python. Phase 1 was originally scoped as "create an independent Python service," with no concrete first feature. Two options were considered: (a) port the existing, working Node search to Python purely as a teaching vehicle, with the Node version kept as a side-by-side reference; (b) skip the port and have the Python service build the *next real increment* the existing search doesn't have yet.
**Options Considered:**
- (a) Port existing search to Python — safe, well-understood scope, but produces no new product capability; the Node version keeps serving production traffic unchanged either way.
- (b) Build the next increment in Python — a real vector database to replace the current flat-file/S3 brute-force index (`embeddings/vectors.json`, fine at ~5,271 designs but not built to scale further), plus retrieval evaluation using the `SearchQueries` DynamoDB log that's already accumulating real query data.
**Decision:** Option (b). The Python service's first real milestone is the next increment of the already-shipped semantic search — most likely a real vector store (candidates: pgvector, OpenSearch, a managed vector DB — not chosen yet) and/or retrieval evaluation — not a re-implementation of what Node already does well.
**Reasoning:** Olga's choice. Avoids spending Phase 1 effort re-solving an already-solved problem; puts the new service's first job as something with genuine additional product value (evaluation, scale headroom) instead of a pure teaching exercise.
**Trade-offs:** Higher initial complexity than a from-scratch toy FastAPI service (real integration with existing Node app, real data, a live DynamoDB log to build eval tooling against) — but Learning.md's Python teaching approach (contrast-based, at an experienced-engineer level) is designed for exactly this kind of real-feature-first learning, not a simplified tutorial project.
**Revisit When:** Phase 1 gets concretely scoped (vector DB choice, how the Python service and the existing Next.js app talk to each other) — see `PROGRESS.md` Next Actions.

## ADR-007 — Phase 1 is internally staged by learning complexity
**Status:** ACTIVE
**Decision date:** 2026-08-06 (Olga's call)
**Problem:** ADR-006 commits Phase 1 to a real feature (vector DB / retrieval evaluation increment for the existing search) rather than a throwaway port. Olga raised a legitimate concern: her first-ever Python code landing directly on "FastAPI + Pydantic + async + a vector DB client + retrieval-eval methodology, all at once" is a lot of new surface area simultaneously for a first contact with the language, even for an experienced C#/.NET engineer.
**Options Considered:**
- Build the whole Phase 1 feature in one pass, teaching concepts as they come up in whatever order the code needs them.
- Stage Phase 1 internally into complexity steps, each one a real, runnable, understood piece before adding the next.
**Decision:** Stage Phase 1 as:
  1. **Bare FastAPI skeleton** — one health-check endpoint, one `pytest` test, runs locally. Teaching focus: Python syntax/indentation vs C# braces, `def`/type hints vs C# methods/types, modules/imports vs namespaces, venv vs NuGet/.csproj.
  2. **Pydantic request/response models** — contrast with C# records/POCOs. This is where Phase 1's real milestone (Olga can independently read/modify/debug the code) starts getting exercised for real, on a small surface.
  3. **The actual feature** (vector DB client, embedding calls, retrieval evaluation) built on top of the now-understood skeleton, not simultaneously with it.
**Reasoning:** Keeps ADR-006's real-feature commitment (no throwaway toy project) while introducing new-language complexity incrementally rather than all at once — matches `Learning.md`'s contrast-based, experienced-engineer teaching approach without overwhelming the first Python session.
**Trade-offs:** Slightly slower to reach the "real feature" milestone than diving straight in, but lower risk of the first Python session being overwhelming enough to stall momentum.
**Revisit When:** Step 1 (bare skeleton) is done and Olga can read/explain it — reassess whether step 2/3 pacing feels right or needs adjusting.

## ADR Template
### ADR-XXX — [Title]
**Status:** PROPOSED / ACTIVE / SUPERSEDED  
**Problem:**  
**Options Considered:**  
**Decision:**  
**Reasoning:**  
**Trade-offs:**  
**Revisit When:**  
