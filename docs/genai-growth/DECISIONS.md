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

## ADR Template
### ADR-XXX — [Title]
**Status:** PROPOSED / ACTIVE / SUPERSEDED  
**Problem:**  
**Options Considered:**  
**Decision:**  
**Reasoning:**  
**Trade-offs:**  
**Revisit When:**  
