# Architecture Summary — GenAI Phase 0

Phase 0 deliverable per `ROADMAP.md`. This is not a full architecture re-documentation — the AWS layer is already covered by `docs/AWS-Services-Overview.md`, the cross-repo contracts by `docs/web/platform-architecture-summary.md` + `docs/web/architecture-diagram.md`, and the DynamoDB schema by `docs/integration/dynamodb-schema.md`. This file adds the GenAI-relevant, code-level detail those docs don't carry, organized around the 7 areas `ROADMAP.md` Phase 0 names.

**Headline finding:** Opportunities 1 (natural-language search) and 2 (semantic/hybrid search) in `OPPORTUNITIES.md` are not candidates — they are already built, deployed, and live on the homepage. See §1. This should reorder the roadmap; see the calling session's report for the recommendation.

---

## 1. Catalog / search

Two independent layers, combined client-side:

- **Structured/deterministic filter search** — `web/src/app/components/SearchForm.tsx` (dropdowns: subject, size, orientation, beginner-friendly, width/height/color ranges) posts query params to `/`, consumed by `fetchFilteredDesigns()` in `web/src/lib/data-access.ts:546-650`. Pure in-memory filtering over a cached design list (`designCache`), substring matching on `Caption`/album caption for text, exact range filters for numeric fields. No DB query per request — the whole catalog (~5,271 designs) is cached in the Node process.
- **AI natural-language search (already shipped)** — `web/src/app/api/ai-search/route.ts` calls Claude (`claude-opus-4-8`) with a system prompt that extracts `{searchText, widthFrom/To, heightFrom/To, ncolorsFrom/To}` structured JSON from a free-text query, including thematic expansion ("floral" → "rose, sunflower, lily, ..."). This is exactly Opportunity 1's proposed capability (LLM → structured criteria → deterministic filter), already in production, in Node.js/Next.js (not Python).
- **Semantic/hybrid search (already shipped)** — `web/src/lib/semantic-search.ts` uses AWS Bedrock `amazon.titan-embed-image-v1` multimodal embeddings. Vectors for all designs are precomputed offline by `automation/pinterest-agent/scripts/generate-embeddings.ts` (image vec + text vec per design, weighted 0.75/0.25 for similarity elsewhere) and stored as one flat JSON file, `embeddings/vectors.json` in the `cross-stitch-sitemap-cache` S3 bucket. At request time the whole file is loaded into a module-level `Map` (cached across warm Lambda/EB invocations via `globalThis`) and ranked by brute-force dot product (`rankByVector`) — this is Opportunity 2's proposed capability, but implemented as a **flat-file, in-memory vector store**, not a vector database. At ~5,271 designs this is fast enough; it will not scale to significantly larger catalogs without an actual vector DB (e.g. pgvector, OpenSearch, Pinecone).
- **Combination point** — `web/src/app/components/HeroSearch.tsx` fires `/api/ai-search` and `/api/semantic-search` in parallel (`Promise.allSettled`) for text queries, then `fetchFilteredDesigns` (`data-access.ts:580-602`) merges them: when both a text filter and `semanticIds` are present, text match is the hard filter and semantic order is used only for re-ranking within it; with no text filter, semantic order is authoritative. This is a working hybrid-retrieval pattern already in production.
- **Image search (bonus, not yet in OPPORTUNITIES.md as its own line)** — `web/src/app/api/image-search/route.ts` sends an uploaded photo to Claude (`claude-haiku-4-5-20251001`) for a 1-2 sentence description, then feeds that description into the same `semanticSearch()` function. `HeroSearch.tsx` also supports "search by image" using the image embedding path (`imageSearch()` in `semantic-search.ts`, currently only reachable from `similar-designs.ts`, not yet wired to a route beyond the description-based path).
- **Search logging** — every AI/semantic search call is logged (fire-and-forget) via `web/src/lib/search-log.ts` to the `SearchQueries` DynamoDB table (see `docs/integration/dynamodb-schema.md` §4.14) — a ready-made dataset for retrieval evaluation (Opportunity 2 / Phase 9) once enough volume accumulates.
- **Related-searches suggestion** — `HeroSearch.tsx` also calls `/api/related-searches` after a semantic search to suggest follow-up queries (not yet inspected in depth this session — worth a look before building anything overlapping).

**Implication for Phase 1+:** the future Python/FastAPI service's job is *not* "build search AI from scratch" — it already exists in Node. The realistic Python-service angle is either (a) porting this proven pattern to Python as the Phase 1 teaching vehicle, or (b) building the *next* increment (real vector DB, reranking, retrieval eval, RAG) on Python while the existing Node implementation keeps serving production traffic unchanged. Recommend discussing this framing explicitly before scoping Phase 1.

---

## 2. Image-to-pattern conversion pipeline

Far more sophisticated than a naive nearest-DMC-color mapper, and entirely deterministic (no LLM in the hot path):

- **Core algorithm** — `web/src/lib/pattern-converter.ts`. Converts sRGB → LAB color space, runs k-means++ clustering (5 runs, best-of, seeded PRNG derived from the file's own bytes for reproducibility) to quantize colors, snaps cluster centroids to the nearest of 454 DMC threads using either CIE76 (fast) or CIEDE2000 (perceptually accurate, ~10-20x more expensive) distance depending on `ColorDistanceMode`.
- **Mode-aware pipeline** — `ConversionMode` = `photo | illustration | line-art`. Line-art/illustration mode adds a dedicated **outline-preservation pass**: full-resolution morphological top-hat edge detection (`detectOutlineMask`) finds thin strokes/keylines before any downsampling can blur them, then `resolveOutlineComponents` decides (via connected-component analysis + distinctness-from-neighbors check) which candidates are genuine strokes worth force-preserving in the final grid, bypassing the normal "keep top N colors by pixel count" trim.
- **Existing "image analysis/type detection" hook (deterministic today)** — `web/src/lib/image-analysis.ts`. Classifies an uploaded image as `photo | line-art | typography | illustration` using hand-tuned heuristics (bimodal luminance histogram, mean saturation, Sobel edge density, 8×8 color-bucket diversity, flat-pixel-pair fraction) — no AI call. Exposed via `POST /api/analyze`, consumed by `web/src/app/components/ImportFromPhotoDialog.tsx` to auto-suggest a `ConversionMode` and a minimum recommended width (`imageTypeToMode()`), which the user can override.
- **This is exactly the plug-in point for Opportunity 4** (AI-assisted conversion settings): the deterministic classifier + its confidence/warnings output is already structured as a recommendation the UI acts on. An LLM-based upgrade would replace or augment `analyzeImage()`'s heuristic classification (which the code's own comments admit required two rounds of recalibration against real examples — colorDiversity/flatFraction thresholds tuned by trial and error) with a vision-model call, likely more robust to edge cases than hand-tuned pixel statistics, while keeping the deterministic k-means/DMC-matching conversion untouched (per Learning.md's "deterministic code for deterministic responsibilities" principle — color quantization has no business being LLM-driven).
- **Editor entry point** — `web/src/app/components/ImportFromPhotoDialog.tsx`, `web/src/app/photo-to-cross-stitch/ConvertClient.tsx`. Full pipeline doc (routes, PDF export, canvas, palette bar, undo/redo) at `docs/web/converter-functionality.md` — **note: that doc is stale**, dated 2026-06-25 and describing only the basic Euclidean-RGB DMC mapping; it predates the LAB/CIEDE2000/k-means/outline-detection work found in this session's read of `pattern-converter.ts`. Worth a refresh outside this GenAI task.

---

## 3. Editor

Lives entirely inside the photo-to-cross-stitch converter page — there is no separate "editor" route today:

- `web/src/app/photo-to-cross-stitch/ConvertClient.tsx` — all interactive state: tool selection (pencil, fill, erase-fill), undo/redo (50-step stack), view mode (color/symbol/both), Stitch Mode (§4).
- `web/src/app/components/PatternCanvas.tsx` — canvas renderer + mouse handling.
- `web/src/app/components/PaletteBar.tsx` — palette swatch strip, active-color selection.
- **Persistence** — `web/src/lib/pattern-storage.ts` backs a self-provisioning `ConverterPatterns` DynamoDB table (PK `patternId`, GSI `ownerID-index`); saved patterns store `grid` (RLE-encoded), `palette` (JSON), `width`/`height`, capped at 350KB compressed. See `docs/integration/dynamodb-schema.md` §4.9 for the full schema including a known (documented, unfixed) TTL gap.
- **No palette-merge/simplification feature exists yet** — grepped for merge/reduce/simplify-palette logic in the editor and found none. Opportunity 6 (Palette Simplification Assistant) has no existing code to reuse beyond the `PatternPalette[]` data shape itself (DMC number/name/RGB/symbol/stitchCount) — it is a genuinely greenfield feature, consistent with its FUTURE status.
- **Implication for Phase 6 (Editor Agent):** any editor agent's mutating "tools" would operate on this same `grid`/`palette` state and would need to go through the same undo-stack-aware mutation path the UI already uses, not a side channel — worth designing the tool schema around the existing `flood-fill`/`pencil`/palette-swap operations rather than inventing new primitives.

---

## 4. Stitch Mode

Not a separate page/state machine — it's a mode *within* the same converter editor:

- State: `stitchMode` (boolean toggle) and `stitchedCells` (`Set<string>` of `"row,col"` keys) in `ConvertClient.tsx` (~line 458-464, 1045-1066, 2407-2429). Toggling it switches the active tool to "mark," and marking a cell as stitched decrements that color's live remaining-stitch count (`liveCounts`).
- Gated behind login for unsaved work — `window.dispatchEvent(new CustomEvent('openRegisterModal', { detail: { source: 'converter-stitch-mode', ... } }))` (line 1195) prompts registration when a guest tries to use Stitch Mode, tying it to the same auth system as everything else (§6).
- **Correction (2026-08-06, caught by Olga):** the first pass of this review incorrectly claimed `stitchedCells` isn't persisted server-side. It is: `pattern-storage.ts` has a dedicated `saveProgress(id, progressRle)` function and a `progress` attribute in `SavedPattern`, kept as a lightweight partial update separate from `savePattern`/`updatePattern` so marking a cell doesn't re-serialize the whole grid/palette. `ConvertClient.tsx` debounces a `PUT /api/converter/patterns/{id}/progress` (or the `catalog-pattern/{designId}/progress` equivalent for catalog-based patterns) on `stitchedCells` changes, and decodes `data.progress` back into `stitchedCells` on load (~lines 731-732, 823-824). So there is no prerequisite gap here — Opportunity 7 (Stitching Companion) already has durable per-user/per-pattern stitch state to query.

---

## 5. Existing AI-related functionality (survey)

All Anthropic-API-based, all Node.js/TypeScript — useful non-Python prior art for Phase 1's LLM-integration teaching, and a inventory of patterns already proven in this codebase:

| Feature | File | Model | Pattern |
|---|---|---|---|
| Natural-language search → structured filters | `web/src/app/api/ai-search/route.ts` | `claude-opus-4-8` | System prompt → JSON extraction via regex, no tool-calling/structured-output API used |
| Semantic/image search | `web/src/lib/semantic-search.ts` | Bedrock `amazon.titan-embed-image-v1` | Embeddings, not Claude — separate provider (Bedrock, not Anthropic API directly) |
| Image search description step | `web/src/app/api/image-search/route.ts` | `claude-haiku-4-5-20251001` | Vision input → short text → fed into semantic search |
| AI SEO description generation (catalog pages) | `web/src/lib/design-seo-description.ts` | `claude-haiku-4-5-20251001` | Vision-optional prompt, ported 1:1 from a C# original (`uploader/Uploader/Helpers/SeoTextGenerator.cs`) — same prompt/model/heuristic in both languages, non-fatal (`catch { return null }`) so it never blocks the publish pipeline |
| AI title suggestions | `uploader/Uploader/MainWindow.xaml.cs` (`GetSelectedAiTitle()`, ~line 829) | (C#, not yet traced to its HTTP call site this session) | WPF-side, per Milestone 10 (memory: done, board CSV constraint + manual test remaining) |
| Monthly "new AI tools" scan | `automation/pinterest-agent/src/services/aiToolsScan.ts` | Claude with server-side `web_search` tool | **Agentic tool-use loop**: resumes on `stop_reason: "pause_turn"` per Anthropic's documented pattern, `MAX_SEARCH_USES=15` cap learned from a prior `max_uses_exceeded` failure (documented in-code). This is the closest thing in the repo today to Phase 5/7 (tool calling, multi-step agent loop) — worth reading before designing the Phase 1 service's own tool-calling code, as a "what already worked" reference. |
| Pinterest-agent AI trend/design analysis | `automation/pinterest-agent/src/services/*` (`historyStore.ts`, `recommendationChangeNotifier.ts`, `anomalyNotifier.ts`, `competitorScan.ts`) + `scripts/test-ai-trend-analysis.ts`, `scripts/test-ai-design-analysis.ts` | Claude (model not confirmed this session) | Daily Lambda pipeline step generating trend/anomaly narrative reports, per `docs/AWS-Services-Overview.md` §7 |

**Implication:** "LLM API integration" is not a blank skill area — there's real prior art for prompt design, vision input, JSON extraction, graceful degradation, and one genuine agentic tool-use loop with documented failure-mode learning (`max_uses_exceeded`). Phase 1's Python teaching should explicitly contrast FastAPI/Pydantic structured-output patterns against what `ai-search/route.ts`'s manual-regex JSON extraction does today (a good "why we'd do this differently in Python with Pydantic" teaching moment).

---

## 6. Auth

- **Session mechanism** — `web/src/lib/session.ts`: JWT (HS256, `jose` library) signed with `SESSION_SECRET`, stored in an httpOnly, `sameSite: lax`, 30-day cookie named `cs_session`. Payload is `{ userId, email }` where `userId` is the `cid` correlation GUID from `CrossStitchUsers` (see `docs/integration/dynamodb-schema.md` §4.6). `getSession(request)` reads and verifies the cookie server-side; `createSessionToken`/`setSessionCookie`/`clearSessionCookie` round out the module.
- **Login/registration** — `web/src/app/api/auth/login/route.ts` (sets the cookie), plus `login-from-email` (auto-login from newsletter links), `request-password-reset`, `reset-password`, `forgot-password`, `logout`. User records and password handling covered in `docs/integration/dynamodb-schema.md` §4.6 — **note the existing doc flags passwords as stored in plaintext** (`users.ts:325`, "for migration purposes"), a pre-existing condition, not something this review is introducing.
- **Client-side state** — `web/src/app/components/AuthControl.tsx` mirrors login state into `localStorage` for UI purposes but the actual authorization boundary is the server-verified JWT cookie, not the client cache.
- **Implication for Phase 5+ (tool-calling authorization boundaries):** a future Python/FastAPI service sitting behind or alongside the Next.js app has two realistic integration options — (a) verify the same JWT directly in Python (same `SESSION_SECRET`, same `HS256`/`jose`-compatible verification, e.g. via `python-jose` or `PyJWT`), or (b) have the Python service stay unauthenticated and only ever be called server-side from Next.js API routes that have already verified the session, forwarding `userId`/`email` as trusted params. Option (b) is simpler and defers a real cross-language auth integration to when it's actually needed (e.g. Phase 6 mutating tools) — worth deciding explicitly rather than defaulting into (a).

---

## 7. Analytics/monitoring, CI/CD, deployment (spot-check only)

Already documented in `docs/srs/13-Monitoring-and-Alerting-Specification.md` (structure: Philosophy, What's measured, Alert rules, Scheduled notifications, Dashboards, Known gaps) and `docs/AWS-Services-Overview.md` §12 (CloudWatch). Spot-checked against `web/package.json` scripts (`dev`, `build`, `start`, `lint`, `test` [Vitest], `test:e2e` [Playwright]) — confirms the existing docs' claim of **no CI pipeline**; builds/tests/deploys are run locally (`eb deploy`), consistent with `docs/web/platform-architecture-summary.md`'s "No CI is configured" note. Nothing found this session contradicts either doc; no update needed here. `docs/srs/15-Security-and-Threat-Model.md` (Assets, Trust boundaries, Threat catalog, What's done well, Out of scope, Deferred-items link) likewise not contradicted by anything found — session-log tables in `search-log.ts`/`editor-events.ts` (fire-and-forget writes, silently swallow failures) are a pre-existing, already-flagged pattern (see `docs/integration/dynamodb-schema.md` §4.14), not new.

**Implication for Phase 9/10:** the `SearchQueries` table (§1 above) is a ready-made evaluation dataset once the AI search feature has run long enough to accumulate volume — retrieval-quality eval (Phase 9) could query it directly rather than needing new logging infrastructure.

---

## Cross-cutting notes for the calling session

1. Opportunities 1 and 2's `Status` fields ("CANDIDATE — HIGH PRIORITY") are stale relative to what's actually in production. See the OPPORTUNITIES.md update in this same pass.
2. `docs/web/converter-functionality.md` is stale (pre-dates the LAB/k-means/outline-detection rewrite of `pattern-converter.ts`) — flagging for the calling session to decide whether to refresh it; out of scope for this GenAI-focused pass to fix.
3. ~~`stitchedCells` (Stitch Mode progress) is not currently persisted server-side~~ — **corrected 2026-08-06, this was wrong**: it is persisted via `saveProgress()`/the `progress` attribute. See §4.
