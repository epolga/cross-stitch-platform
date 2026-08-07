# GenAI Initiative Progress

## Current Status
**Current milestone:** Two parallel tracks as of 2026-08-06 (Olga's decision — split working time between them rather than sequencing):
1. **Phase 1, Python, `search-service/`** — Step 1 (bare FastAPI skeleton) and Step 2 (Pydantic models + `/evaluate` endpoint computing retrieval metrics) both done. Step 3 is now fully built end-to-end, shipped 2026-08-07: Node.js data-collection (Parts A/B/C — logging what was shown, click engagement, weighted downloads) plus the Python evaluation consumer (`app/evaluation.py` + `scripts/evaluate_recent_searches.py`), verified with a real (empty-result) dry-run against production. Remaining: nothing to build — just wait for real search traffic to accumulate, then re-run the script for real numbers.
2. **Opportunity 9, Node.js** — automated design generation from trending themes with a feedback-learning loop. Not started. See `OPPORTUNITIES.md` Opportunity 9 for scope and the Language decision (Node.js, not Python — depends on reusing `pattern-converter.ts`; likely lives inside `web/`, not a separate service).
**Overall state:** Architecture review done. Python skeleton exists, runs locally, not deployed anywhere. Opportunity 9 not yet started.

## Completed
- Defined development-first / learning-in-parallel approach.
- Defined proactive opportunity discovery.
- Defined evidence-based skill tracking.
- Defined initial GenAI roadmap.
- Separated GenAI growth documentation from production code.
- Resolved local Python install discrepancy (2026-08-06): `python` and `py`
  disagreed (3.13.2 vs 3.13.14) because two separate installs existed — a
  python.org installer at `C:\Python313\` (registered in `HKLM`) and a
  Microsoft Store package (registered in `HKCU`, which the `py` launcher
  prefers per PEP 514). Removed the Store package
  (`PythonSoftwareFoundation.Python.3.13`); `python` and `py` now both
  resolve to `C:\Python313\` (3.13.2), sharing one pip/site-packages
  (`AppData\Roaming\Python\Python313\site-packages`).
- **Phase 0 (Repository and Architecture Review), 2026-08-06.** Full
  writeup: `docs/genai-growth/ARCHITECTURE_SUMMARY.md`. Headline finding:
  Opportunities 1 (natural-language search) and 2 (semantic/hybrid search)
  in `OPPORTUNITIES.md` — previously tracked as CANDIDATE — are already
  built and live in production (`HeroSearch.tsx`, `ai-search/route.ts` on
  Claude Opus, `semantic-search.ts` on Bedrock Titan embeddings, hybrid
  merge in `data-access.ts`). Also found a proven agentic tool-use loop
  already in the codebase (`automation/pinterest-agent/src/services/aiToolsScan.ts`,
  handles `pause_turn` continuation and a documented `max_uses_exceeded`
  failure mode) — useful prior art for Phase 5/7. `OPPORTUNITIES.md`
  updated with reuse-path detail for Opportunities 1, 2, 4, 6, 7.
  **Correction (same day, caught by Olga):** the review's first pass
  wrongly claimed Stitch Mode progress (`stitchedCells`) isn't persisted
  server-side. It is — `pattern-storage.ts`'s `saveProgress()`/`progress`
  attribute, debounced `PUT .../progress` from `ConvertClient.tsx`, reload
  on open. Fixed in `ARCHITECTURE_SUMMARY.md` and `OPPORTUNITIES.md`
  Opportunity 7. Lesson: verify a subagent's specific factual claims
  (not just that cited files/models exist) before passing them to Olga.

## In Progress
- **Track 1 (Python)**: `search-service/` skeleton built 2026-08-06 (new
  top-level folder, `.venv`, FastAPI+uvicorn+pytest+httpx). `/health` and
  `/evaluate` (precision@k, recall@k, MRR over `app/metrics.py`, pure
  functions + Pydantic schemas in `app/schemas.py`) both implemented and
  tested. **Deployed for real (ADR-008):** Lambda `search-service`
  (Python 3.13) behind API Gateway HTTP API, live at
  `https://c9mkmhf9bi.execute-api.us-east-1.amazonaws.com` — both
  `/health` and `/evaluate` verified with real `curl` requests against
  the public endpoint. `search-service/deploy.ps1` (mirrors
  `automation/pinterest-agent/lambda/deploy.ps1`) makes this repeatable.
  Solved Linux-wheel packaging for `pydantic-core`'s compiled component;
  found+fixed a real API Gateway quick-create bug (missing Lambda invoke
  permission) and a real PowerShell parser bug (em-dash inside a string
  literal). See ADR-008 for full detail. Earlier skeleton committed to
  git (`bb455e5`), deploy-script/Lambda additions committed same day
  (`36cfdc2`), pushed. **Step 3 explicitly deferred to the next session**
  (Olga's call, 2026-08-06) — not started today. See Next Actions below
  for exactly where to pick it up.
- **Track 2 (Node.js)**: Opportunity 9 (design generation) scoped and
  logged 2026-08-06, not started. Needs: trend detection (reuse
  `aiToolsScan.ts`'s web_search pattern), an image-generation model
  (new integration, not yet evaluated), wiring into `pattern-converter.ts`,
  and a feedback-capture/preference-document mechanism (in-context
  learning, not fine-tuning — see `OPPORTUNITIES.md` Opportunity 9 for why
  fine-tuning was ruled out).

## Next Actions
1. **Track 1 Step 3 — in progress, three-part plan (2026-08-07):**
   decided with Olga: (A) log the actual displayed `retrievedIds` per
   search — **done 2026-08-07**, see below; (B) click-through logging on
   search-result design cards, tied by `searchId`, into a new
   `SearchEngagement` table — **not started, pick up here next**; (C)
   weight downloads higher than plain clicks in the eventual relevance
   signal — deferred until (B) exists and real data can be compared.
   Deployed Lambda (`search-service`, live at
   `https://c9mkmhf9bi.execute-api.us-east-1.amazonaws.com`) is ready to
   receive the actual `/evaluate`-consuming logic once (A)+(B) have
   accumulated enough real data — no further deploy-plumbing needed.

   **Part A shipped 2026-08-07:** `SearchQueries` now captures what was
   actually shown, not just the query. Two-phase write, since neither
   search API route computes the final merged/ranked list —
   `data-access.ts`'s `fetchFilteredDesigns()` does that later and can
   reorder relative to either route's own raw ranking (e.g. text search:
   semantic ranking is subordinate to the hard text filter). `logSearch()`
   (`web/src/lib/search-log.ts`) now returns a `searchId`; `ai-search`/
   `image-search` routes return it to `HeroSearch.tsx`, which round-trips
   it through the URL (`?searchId=...`) back to `page.tsx`; once
   `fetchFilteredDesigns()` resolves, `page.tsx` calls the new
   `logSearchResults(searchId, designs.map(d => d.DesignID))` to
   `UPDATE` the same `SearchQueries` row with the real displayed list.
   Only fires when `searchId` is present — plain catalog browsing/
   pagination never sets it, so this doesn't touch normal traffic. Full
   schema detail: `docs/integration/dynamodb-schema.md` §4.14. Verified:
   `tsc --noEmit` clean, Vitest 61/61 still passing, `next lint` shows
   only pre-existing warnings in unrelated files.

   **Part B shipped 2026-08-07:** new self-provisioning `SearchEngagement`
   table (`web/src/lib/search-engagement.ts`, following the
   `EmailEntryEvents`/`EditorEvents` self-provision pattern, not
   `SearchQueries`' manual one) — one row per `(searchId, designId)` pair,
   `action`/`weight` (`click`=1, `download`=2) upgraded-never-downgraded
   via a `ConditionExpression`. New `POST /api/search-engagement` endpoint.
   `searchId` threaded as an optional prop through `page.tsx` →
   `DesignListWrapper` → `DesignList` → `DesignCard` — only set on an
   actual AI/semantic search hand-off, so plain catalog/album browsing
   never logs anything. `DesignCard`'s link now fires a fire-and-forget
   `fetch(..., { keepalive: true })` click log on click (survives the
   navigation the click itself causes). Full schema:
   `docs/integration/dynamodb-schema.md` §4.17. Verified: `tsc --noEmit`
   clean, Vitest 61/61, `next lint` no new warnings.

   **Part C shipped 2026-08-07: the `download` action is now wired,
   both download paths.** New shared client helper
   (`web/src/lib/search-engagement-client.ts`, `logSearchEngagementClient`)
   used by both `DesignList.tsx` (click) and `DownloadPdfLink.tsx`
   (download), replacing the Part B version's inline fetch. `searchId`
   reaches a download two ways: (1) directly as a prop when downloaded
   straight from a search-result card; (2) appended to the design-page
   URL (`designUrlWithSearchId()` in `DesignList.tsx`) when the user
   clicks through first — threaded `app/[slug]/page.tsx` →
   `app/designs/[designId]/page.tsx` (new `searchParams` prop, wasn't
   accepted before) → `DesignDownloadControls` (new `searchId` prop) →
   `DownloadPdfLink`. Both paths funnel through `DownloadPdfLink`'s
   existing `recordDownload()` callback, the one place all three download
   modes (free/register/paid) already converge before opening the PDF.
   Known gap, judged acceptable: prev/next/"you may also like" links on
   the detail page don't carry `searchId` forward. Verified: `tsc --noEmit`
   clean, Vitest 61/61, `next lint` no new warnings, full `next build`
   run to confirm the page-signature changes (`searchParams` added to
   `app/designs/[designId]/page.tsx`) don't break routing.

   Binary relevance only so far for `/evaluate` itself —
   `search-service/app/metrics.py`'s `relevant_ids` is still a plain set;
   a weighted precision/recall variant is future work, not scoped yet.

   **Python `/evaluate` consumer shipped 2026-08-07** (same day, once
   Olga caught that "wait for real traffic" only blocks getting
   *meaningful numbers*, not writing/testing the code itself — corrected
   mid-session): `search-service/app/evaluation.py` — pure functions
   (`evaluate_search`, `evaluate_all`) that turn `SearchQueryRecord`/
   `EngagementRecord` data into per-search and aggregate precision@k/
   recall@k/MRR via the existing `app/metrics.py`. Deliberately zero I/O,
   so it's fully unit-tested on synthetic fixtures
   (`tests/test_evaluation.py`, 5 new tests, 17/17 passing overall) without
   needing real accumulated traffic — mirrors keeping business logic out
   of a repository/DbContext layer in C#/.NET. The actual DynamoDB-reading
   side is a separate, deliberately thin script,
   `search-service/scripts/evaluate_recent_searches.py` (boto3, kept in a
   new `requirements-dev.txt` rather than `requirements.txt` since the
   deployed Lambda itself never touches DynamoDB — bundling boto3 into
   the Lambda zip would be dead weight). Ran it for real against
   production (read-only Scan): correctly reports `0` evaluable
   searches right now — `SearchEngagement` doesn't exist yet since no
   real click/download has landed since today's deploy — confirming the
   whole pipeline is wired correctly end-to-end, just waiting on traffic
   for real numbers. Verified: `pytest` 17/17, live dry-run against real
   AWS.

   **Track 1 Step 3 is now fully built, both data-collection (Parts A/B/C)
   and the evaluation consumer** — nothing left to code; next step is
   purely waiting for real search traffic to accumulate, then re-running
   `evaluate_recent_searches.py` for actual numbers.
2. **Track 2 — pick up here next session:** Build order decided 2026-08-06
   (see `OPPORTUNITIES.md` Opportunity 9 "UX vision" / "Build-order
   decision"): build the core pipeline first (trend detection → image
   generation → `pattern-converter.ts` → editor review → diff/feedback
   questions → publish via the existing "Publish to Catalog" button),
   decide the trigger mechanism (button vs. scheduled) later — it's a
   thin, swappable front end that doesn't affect the core build. Start
   with trend detection specifically (lowest risk, reuses the proven
   `aiToolsScan.ts` pattern) before the new, unevaluated image-generation
   integration.

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
