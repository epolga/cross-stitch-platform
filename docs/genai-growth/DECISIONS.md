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

## ADR-008 — search-service deploys as Lambda behind API Gateway
**Status:** ACTIVE
**Decision date:** 2026-08-06 (Olga's call)
**Decision:** `search-service` will be deployed as an AWS Lambda function (via the Mangum ASGI adapter), not Elastic Beanstalk or ECS/Fargate — resolving the "which deployment option" question raised earlier the same session.
**Reasoning:** Matches the existing `automation/pinterest-agent` Lambda pattern Olga already operates; near-$0 cost while this service has low/no real traffic; no server to manage/patch, consistent with running as a single operator with no dedicated ops team.
**What's done (2026-08-06) — actually deployed and live:**
- Added `mangum` to `search-service/requirements.txt`; `app/main.py` exports `handler = Mangum(app)` at the bottom, unchanged `/health` and `/evaluate` routes underneath.
- `tests/test_lambda_handler.py` — 2 tests simulating a real API Gateway v2 event and calling `handler(event, {})` directly (no AWS involved), both passing (12/12 total suite).
- **Real AWS resources created:** IAM role `search-service-lambda` (`AWSLambdaBasicExecutionRole` only — CloudWatch Logs, no other access, since current code calls no other AWS service); Lambda function `search-service` (Python 3.13, 256MB, 10s timeout); API Gateway HTTP API `search-service-api` (`https://c9mkmhf9bi.execute-api.us-east-1.amazonaws.com`).
- **Packaging solved:** Python deps for Lambda must be Linux (manylinux) wheels, not whatever the local dev machine builds — `pydantic-core` specifically ships a compiled binary (`.pyd` on Windows vs `.so` on Linux, same fact discussed earlier the same session re: what a "package" contains). Fixed via `pip install --platform manylinux2014_x86_64 --only-binary=:all: --python-version 3.13 --target build -r requirements.txt`, no Docker needed since all deps have published manylinux wheels.
- **Real bug found and fixed:** `create-api --target` (API Gateway's "quick create" flow) did NOT actually wire the Lambda invoke permission despite documentation suggesting it does — curl through the real API URL returned `Internal Server Error` with zero matching Lambda invocation logs (proof the request never reached the function). Fixed with an explicit `aws lambda add-permission --principal apigateway.amazonaws.com`, made idempotent (remove-then-add) in the deploy script since quick-create's behavior here isn't reliable.
- **Reusable deploy script:** `search-service/deploy.ps1`, mirroring `automation/pinterest-agent/lambda/deploy.ps1`'s structure (build → ensure role → zip → create-or-update function → wire trigger), adapted for Python/Lambda-behind-API-Gateway. Ran successfully end-to-end against already-existing resources (idempotent update path). One real PowerShell bug found+fixed while writing it: an em-dash character inside a double-quoted string literal (not inside a `#` comment, those are fine) broke PowerShell 5.1's parser with a misleading "missing closing brace" error reported several lines later — root-caused via `[System.Management.Automation.Language.Parser]::ParseFile` on isolated fragments, not obvious from the error message alone.
- Verified end-to-end with real `curl` requests against the live public API endpoint for both `/health` and `/evaluate`.
**What's NOT done:** No scoped permissions beyond basic execution (fine — current code needs none). No custom domain/DNS for the API endpoint (using the raw `execute-api.amazonaws.com` URL). No monitoring/alerting wired up beyond what CloudWatch captures automatically.
**Revisit When:** Step 3 (the real feature) is scoped enough to know what additional IAM permissions the Lambda needs (e.g. DynamoDB read on `SearchQueries` for retrieval evaluation) — add via `aws iam put-role-policy` on the existing role, same iterative-policy pattern as `pinterest-agent`'s role.

## ADR-009 — Catalog dedup moves from a static text avoid-list to a client-side search_catalog tool, with no hardcoded similarity threshold
**Status:** ACTIVE
**Decision date:** 2026-08-09 (Olga's call, after a real live dedup failure — see PROGRESS.md 2026-08-08 entry)
**Problem:** `detectTrend()`'s avoid-list (`buildPrompt()`) dumped every unique catalog design caption as text into the prompt and trusted the model to visually spot overlap. This has a structural ceiling: exact-string/eyeballed comparison can't catch a near-duplicate like "kawaii green frog" against an existing "Kawaii Cottagecore Frog" design — no shared substring, same subject. Fixing the album-vs-design-caption granularity bug (2026-08-08) narrowed the gap but didn't remove it.
**Options Considered:**
- (a) Keep the static text list, invest further in making it more complete/granular (e.g. include synonyms).
- (b) Add a deterministic post-hoc check: after the model proposes a theme, embed it and compare against the catalog's existing embeddings (already computed, `embeddings/vectors.json`), reject/retry automatically past a hardcoded similarity threshold.
- (c) Give the model a client-side tool (`search_catalog`, Anthropic custom tool-use / function calling) that runs the same embedding comparison, callable on demand mid-reasoning for as many candidate themes as the model wants to check, with the model judging the returned raw score rather than a hardcoded gate.
**Decision:** (c). No literal duplicate list is passed in the prompt at all anymore — `buildPrompt()` just instructs the model to call `search_catalog` before finalizing an answer. `runSearchCatalogTool()` (`trend-detection.ts`) executes `findNearestTextMatch()` (new export, `semantic-search.ts`, reuses the existing `embedText`/`loadVectorIndex`/`dotProduct` machinery) and returns the closest existing design's caption and raw similarity score as text — the model decides whether that counts as "already covered," the same way it would read the old avoid-list, just now backed by real semantic comparison instead of eyeballing.
**Reasoning:** (a) doesn't fix the underlying exact-match ceiling, only patches specific gaps as they're found live — the same failure mode that already needed two rounds of fixing (album captions → design captions → still missed "kawaii green frog"). (b) would work but requires a similarity threshold calibrated against real score data that doesn't exist yet (no prior runs of this embedding model against this catalog for this purpose) — picking one blind risks the same "arbitrary cap silently excludes real cases" bug class that already bit this file's avoid-list twice (the 80-album-caption cap, then the album-vs-design-caption gap itself). (c) defers the accept/reject judgment to the model (which already has to read and reason about the result either way) while keeping the actual retrieval deterministic and cheap (brute-force dot product against ~5,271 precomputed vectors, no new AI call beyond the one embedding of the candidate theme) — consistent with ADR-005's split (deterministic code does retrieval, the LLM does the ambiguous judgment call). It also lets the model check multiple candidate themes within one run instead of committing to one theme and only finding out post-hoc that it was a duplicate (which would have wasted an entire paid web-search-bearing run under the old flow).
**Trade-offs:** No enforced hard gate — a determined/careless model response could still ignore a duplicate result and finalize the theme anyway; there is no code-level reject to fall back on today. `MAX_CONTINUATIONS` raised 2 → 4 (`trend-detection.ts`) since `search_catalog` round-trips now share the same turn budget as `web_search` continuations — an unverified assumption that 4 is enough headroom for both. No real live `detectTrend()` run has exercised this path yet (verified only via `tsc --noEmit`, `eslint`, and Vitest 88/88 passing, including 13/13 in `trend-detection.test.ts` — all against mocked/unit-level input, not a real Bedrock+Anthropic round trip).
**Revisit When:** After the next real `detectTrend()` run — check whether `search_catalog` actually gets called, what real similarity scores come back for known cases (re-test the "kawaii green frog" scenario specifically), and whether a hardcoded threshold turns out to be worth adding once real score data exists. If the model turns out to ignore high-similarity results in practice, option (b)'s hard gate becomes the fallback.

**Update 2026-08-09 — confirmed live, with a real caveat found along the way.** Full detail: `PROGRESS.md` 2026-08-09 entry. Three real bugs fixed before a clean run was possible (a `container_id` 400 error specific to mixing a client tool with `web_search`'s `pause_turn`; `extractJson()` too strict about numeric-string fields; a real embedding-staleness gap — `vectors.json` was missing 16 published designs, including a real "Capybara" that a live run proposed again). The staleness gap is now closed structurally, not just patched: `detectTrend()` calls a new `backfillMissingEmbeddings()` (`semantic-search.ts`) as its first step every run. First clean full run (theme "luna moth") produced real cited sources and reasoning that correctly referenced an actual existing catalog design by name — no hardcoded threshold added yet, still an open question for a future round with more real score data.

**Update 2026-08-09 (later same day) — added a second, album-level check, not a replacement for the design-level one.** Olga's ask, prompted by checking Album 59 ("Butterflies," 73 designs individually captioned "Butterfly 1", "Butterfly 2", etc.). Rationale: a candidate theme can score low against every single terse/generic individual design caption while still obviously overlapping with an entire dedicated album — this is close to the original problem the old album-caption-only avoid-list existed to catch (before it was replaced 2026-08-08 for missing the frog case), just now solved by embeddings instead of exact text. New `findNearestAlbumMatch()`/`backfillMissingAlbumEmbeddings()` (`semantic-search.ts`), a separate S3 file (`embeddings/album-vectors.json`, text-only, 114 albums) rather than folding into the design vectors file — different ID space, different scale. `runSearchCatalogTool()` now runs and reports both checks side by side, not merged into one score (design-level and album-level similarity aren't directly comparable numbers). First real data point: "butterfly portrait" → Album 59 "Butterflies" at 0.754 similarity vs. "luna moth" → Album 93 "Cacti" (nearest by chance, no real match exists) at 0.643 — a real, usable gap between "genuine match" and "nothing relevant," first concrete signal toward eventually picking a threshold.

## ADR Template
### ADR-XXX — [Title]
**Status:** PROPOSED / ACTIVE / SUPERSEDED  
**Problem:**  
**Options Considered:**  
**Decision:**  
**Reasoning:**  
**Trade-offs:**  
**Revisit When:**  
