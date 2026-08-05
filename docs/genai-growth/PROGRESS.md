# GenAI Initiative Progress

## Current Status
**Current milestone:** Repository/architecture review before implementation.  
**Overall state:** Planning complete; implementation not yet started.

## Completed
- Defined development-first / learning-in-parallel approach.
- Defined proactive opportunity discovery.
- Defined evidence-based skill tracking.
- Defined initial GenAI roadmap.
- Separated GenAI growth documentation from production code.

## In Progress
- Phase 0 (Repository and Architecture Review) scheduled to start 2026-08-06 morning.

## Next Actions
1. Clarify the local Python install situation: `python --version` reports
   3.13.2 (`C:\Python313\python.exe`) but the `py` launcher reports
   3.13.14 — figure out why these disagree (likely two separate installs)
   before relying on either for the Phase 1 service, so Olga knows which
   Python she's actually running commands against.
2. Inspect repository architecture.
3. Identify the insertion point for a Python/FastAPI AI service.
4. Review current catalog metadata/search implementation.
5. Review current AI/image-classification functionality.
6. Populate `OPPORTUNITIES.md` from actual code/product flows.
7. Choose the smallest useful first production feature.

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
