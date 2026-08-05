# GenAI Engineering Roadmap

This roadmap is dynamic. Product value has priority over following phases mechanically.

## Phase 0 — Repository and Architecture Review
Inspect frontend/backend structure, AWS infrastructure, databases, authentication, catalog/search, editor, image-to-pattern conversion, Stitch Mode, analytics/monitoring, CI/CD, deployment, and existing AI-related functionality.

**Output:** architecture summary and initial opportunity inventory.

## Phase 1 — Production Python Service
Create an independent Python service that can host future AI functionality.

**Real milestone (not just "service exists"):** Olga has no prior Python
experience (C#/.NET background) — see `Learning.md` § Python Background.
Phase 1 is only satisfied when Olga can independently read, modify, and
debug this Python/FastAPI code herself, not merely when it is deployed.

**Skills:** Python, typing, async/await, FastAPI, Pydantic, pytest, configuration, logging, secrets, API integration.

## Phase 2 — Natural-Language Pattern Search
Example: “Find me a realistic black cat pattern under 120 stitches wide with no more than 20 colors.”

The LLM converts intent into structured criteria. Existing deterministic search/filtering handles exact constraints.

**Skills:** LLM APIs, structured output, schemas, prompt design, validation, retries, timeouts, latency/cost awareness.

## Phase 3 — Semantic / Hybrid Catalog Search
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
