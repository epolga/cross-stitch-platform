# Test Plan — cross-stitch-platform

**Status:** Draft, current-state assessment verified against the actual test suites (not
assumed) plus a risk-based plan for closing the gap

**Date:** 2026-07-11

**Related:** `use-cases/*.md` (source for `test-cases/*.md`), `05-SAD.md` §10 (risk summary
this plan prioritizes against)

## 1. Purpose and honesty note

Unlike `00`–`08`, this document is not purely descriptive of an existing, working
practice — automated test coverage across the platform is currently **thin and
concentrated in one component**. This plan documents §2 (verified current state) as fact,
and §4–§7 (approach, priorities, what to build next) as a proposal, clearly separated so
the two are never confused with each other.

## 2. Current state (verified, 2026-07-11)

| Component | Test framework configured | Test files found | What they cover |
|---|---|---|---|
| **Website** (`web/`) | Vitest (`npm run test`) + Playwright (`npm run test:e2e`) | 10 Vitest files + 10 Playwright spec files | See §2.1 and §2.2 — **correction, 2026-07-12:** an earlier version of this document claimed no e2e tooling existed; that was wrong, found while wiring up CI (§4.4) |
| **Pinterest automation — pinterest-agent** (`automation/pinterest-agent/`) | None — `package.json` `"test"` script is a stub (`echo "Error: no test specified" && exit 1`) | 0 | Nothing |
| **Pinterest automation — autopinner** (`automation/autopinner/`, .NET) | None found | 0 | Nothing |
| **Uploader** (`uploader/`, .NET/WPF) | None found | 0 | Nothing |
| **Shared library** (`shared/`, .NET) | None found | 0 | Nothing |

### 2.1 Website — existing Vitest coverage (verified by reading each file)

| File | Covers |
|---|---|
| `src/app/api/converter/patterns/route.test.ts` | POST save: 401 unauth, 400 missing grid, 400 dimension mismatch, 400 zero width, happy path, thumbnail pass-through |
| `src/app/api/converter/patterns/my/route.test.ts` | GET list: 401 unauth, happy path, empty list, 500 on storage error |
| `src/app/api/converter/patterns/[id]/route.test.ts` | GET: 400 invalid id, 404 not found, 403 non-owner, 200 owner, 200 public (no owner) — PUT: same auth/ownership matrix + happy path + thumbnail pass-through |
| `src/app/api/profile/votes/route.test.ts` | GET: 401 no email, `includeDesigns=false` count-only, design hydration + missing-design filtering |
| `src/app/api/subscription/plan/route.test.ts` | Explicit env plan IDs vs. hardcoded fallback |
| `src/lib/design-likes.test.ts` | `getUserDesignVotes`: paginated GSI query + sorting, email validation rejection |
| `src/lib/download-mode.test.ts` | `normalizeDownloadMode`/`resolveServerDownloadMode`: valid/invalid mode fallback, env precedence |
| `src/lib/image-analysis.test.ts` | `imageTypeToMode`: every confidence/type combination's pipeline routing decision |
| `src/lib/pattern-storage.test.ts` | RLE encode/decode round-trips (incl. edge cases: uniform grid, empty cells, empty grid), `savePattern`/`updatePattern`/`listPatternsByOwner` DDB call shape |
| `src/lib/pattern-thumbnail.test.ts` | Thumbnail canvas generation: empty grid, dimension capping, background fill order, empty-cell skipping, color fill format |

**What this means concretely for API-level (Vitest) coverage:** the only API surface with
meaningful automated coverage is the **saved-pattern CRUD** family
(`/api/converter/patterns*`) plus two unrelated single endpoints (`/api/profile/votes`,
`/api/subscription/plan`). Every other route in `06-API-Specification.md` — all of
auth/registration, all of designs/albums, all of search, `/api/convert` and
`/api/convert/pdf` themselves (the conversion algorithm and PDF generation are untested at
the API-route level despite being the converter's core value — though see §2.2, the
converter *page* does have smoke-level e2e coverage), the PayPal webhook, and every admin
route — has **zero API-route-level test coverage** today.

### 2.2 Website — existing Playwright e2e coverage (verified by reading each file)

`web/playwright.config.ts`: Chromium, headless, `baseURL: http://127.0.0.1:3000`, auto-
starts `npm run dev` as the target server (`DOWNLOAD_MODE`/`NEXT_PUBLIC_DOWNLOAD_MODE`
forced to `paid` for the test run), 1 worker, 1 retry. **The browser executable path is
hardcoded to a Windows Chrome install** (`C:\Program Files\Google\Chrome\Application\chrome.exe`,
overridable via `PLAYWRIGHT_CHROME_PATH`) — this is directly relevant to §4.4 (CI), since a
standard Linux GitHub Actions runner does not have that path.

| File | Covers |
|---|---|
| `tests/auth-ui.spec.ts` | Login/Register button visibility when logged out, login modal open/fields/submit/close, registration modal open |
| `tests/converter-pattern-load.spec.ts` | Loading the converter with no `?pattern` param, a non-existent pattern ID, a 403 (owned by someone else), and the owner-name-in-header happy path |
| `tests/converter-smoke.spec.ts` | Converter page loads, New Pattern / Download PDF buttons present, Download PDF disabled pre-import, Import menu item present, empty-state prompt, broken-pattern-link error message |
| `tests/design-gallery.spec.ts` | Converter heading/empty-state/menu smoke checks (overlaps `converter-smoke.spec.ts`'s scope) + homepage-links-to-catalog check |
| `tests/editor-mirror-selection.spec.ts` | **Regression suite** (per its own `describe` name) for a specific mirror-with-active-selection bug class: selection preserved across Edit-menu open and mirror-dialog radio clicks, correct grid-width expansion on full vs. partial selection |
| `tests/paid-download-flow.smoke.spec.ts` | The inline registration UI renders correctly on the paid-mode download-access page |
| `tests/profile-auth-guard.spec.ts` | `/profile`, `/profile/patterns`, `/profile/votes` all redirect unauthenticated visitors to `/`, with a visible "Redirecting…" state |
| `tests/site-homepage.spec.ts` | Homepage heading, filter/search section, design results section, at least one design card or empty state, no error message, footer |
| `tests/site-nav.spec.ts` | Nav landmark, key links present, Home/catalog link targets, Articles dropdown, auth controls visible, footer |
| `tests/static-pages.spec.ts` | Parametrized 200-status + correct-heading check across a list of static pages |

**What this means concretely for e2e coverage:** unlike the Vitest suite (API/lib-level,
converter-CRUD-focused), the Playwright suite is **UI-focused and broader across the
Website's surface** — homepage, nav, auth modals, profile guards, static pages, and a real
regression suite for a previously-fixed editor bug. It does **not** cover the deeper
paid/register download-gating decision table (§5.2 of `01-LLD-Website.md`) beyond the one
`paid-download-flow.smoke.spec.ts` render check, PayPal webhook handling, or admin routes —
those gaps in §4.2's priority list stand as written.

## 3. Test levels in use / available

| Level | Website | Pinterest automation | Uploader |
|---|---|---|---|
| Unit | Vitest, partial (§2.1) | None | None |
| Integration (API route + mocked AWS SDK) | Vitest, partial (the route.test.ts files mock DynamoDB clients) | None | None |
| End-to-end / UI | **Playwright, real and reasonably broad (§2.2)** — corrects an earlier draft of this document that missed it entirely | N/A (no UI) | None (no UI automation for WPF found) |
| Manual | Implied by operator workflow (e.g. "send test email to admin before a real send," `04-SRS-Uploader.md` NFR-3) but not documented as a formal test procedure anywhere | The `/review-ip` skill's evidence-gathering step is itself a form of manual pre-action verification | Same — "test" buttons (Test Pinterest, Test Announcement Email, Send Admin Test Email) are the *only* pre-production verification mechanism |

## 4. Recommended approach going forward

This section is a proposal, not a description of existing practice.

### 4.1 Principles

- **Prioritize by risk, not by ease.** The areas with the least coverage today
  (auth/payment/PayPal webhook, the conversion algorithm, autopinner's claim logic, the
  Uploader's publish sequence) are also the areas where a bug has the highest cost
  (financial, data-integrity, or reputational). Coverage should be added there first, not
  wherever is most convenient to test.
- **Match the test level to the risk being covered.** A pure-function algorithm (e.g. the
  k-means/LAB conversion pipeline, `02-LLD-Photo-to-Cross-Stitch-Converter.md` §4) is a
  natural unit-test target (deterministic given a fixed seed — see LLD §4.2 step 3, the
  seeded PRNG already makes this testable without flakiness). A multi-step external-API
  flow (autopinner's claim → pin → mark-posted sequence) is better covered by an
  integration test against a local/mocked DynamoDB and a mocked Pinterest client than by
  unit-testing each method in isolation.
- **Don't retrofit tests for their own sake.** Per this project's general engineering
  guidance (no gold-plating), a test's job is to catch a regression that would actually
  matter — not to hit a coverage percentage.

### 4.2 Priority order (tied to `05-SAD.md` §10 risk summary)

| Priority | Area | Why | Suggested test level |
|---|---|---|---|
| 1 | PayPal webhook (`/api/paypal-webhook`) | Directly controls paid access and revenue; signature verification and event-type handling are exactly the kind of branchy logic that regresses silently | Integration (mocked PayPal signature, real event payload fixtures per event type) |
| 2 | Auth/session (`/api/auth/*`, `/api/register-only*`, session issuance) | Gates every paid/register-mode flow; the `01-SRS-Website.md` NFR-7 plaintext-password issue makes this doubly sensitive — any remediation there needs a regression net *first* | Integration |
| 3 | Conversion algorithm (`pattern-converter.ts`, `image-analysis.ts`) | The converter's entire value proposition; deterministic and unit-testable today (seeded PRNG) but currently has zero coverage despite being non-trivial (k-means, LAB color math) | Unit |
| 4 | autopinner claim/pin/retry logic (`DynamoDbDesignRepository.cs`, `PinterestUploader.cs`) | The platform's only Pinterest-pin-creation path; a regression here silently stops all new-design promotion with no user-facing signal | Integration (mocked DynamoDB conditional-update semantics, mocked Pinterest client) |
| 5 | Download-mode gating decision table (`01-LLD-Website.md` §5.2) | Directly controls revenue (paid mode) and access (register mode); the decision table has enough branches (mode × auth state × referrer bypass) to regress silently | Unit/integration on the gating function itself, independent of the full download flow |
| 6 | Uploader publish sequence | High blast radius on failure (orphaned S3/Pinterest state, `04-LLD-Uploader.md` §7) but low frequency (one operator, one action at a time) and no existing .NET test project to build on — lower urgency than 1–5 despite the severity, because likelihood × frequency is much lower | Integration, once a .NET test project exists |

### 4.3 Gaps in tooling, not just tests

- `automation/pinterest-agent/package.json`'s `test` script needs to be replaced with an
  actual runner (the project already uses `tsx`; `vitest` or `node --test` would both fit
  without adding a new toolchain philosophy to the monorepo, since Website already uses
  Vitest).
- No .NET test project exists anywhere in `uploader/`, `automation/autopinner/`, or
  `shared/` — establishing one (xUnit is the common default for .NET 8) is a prerequisite
  for priority 4 and 6 above, not an optional nice-to-have.
- ~~No end-to-end/browser test tooling exists for the Website~~ **Correction: it does**
  (§2.2) — Playwright, 10 spec files, real UI coverage. What's still missing is e2e coverage
  of the *highest-risk* flows specifically (checkout/PayPal, the full paid-mode download
  gate beyond one smoke render check) — §4.2's priority list already covers this gap at the
  API/integration level; extending the *existing* Playwright suite to also exercise those
  flows end-to-end is a reasonable alternative or complement once the underlying logic has
  integration coverage.

### 4.4 Continuous Integration (added 2026-07-12)

A lightweight GitHub Actions workflow now runs on every push/PR touching `web/`:
`npm ci` → `npm run build` → `npm run test` (Vitest). See `.github/workflows/web-ci.yml`.

**Deliberately excluded from this first pass — `npm run test:e2e` (Playwright).** Not an
oversight: `playwright.config.ts` hardcodes the browser executable to a Windows Chrome
install path (§2.2), which does not exist on a standard Linux GitHub Actions runner.
Running the e2e suite in CI needs either a `windows-latest` runner (uses CI minutes at 2×
the Linux rate on the free tier) or reconfiguring the config to use Playwright's own
bundled Chromium (`npx playwright install chromium`) instead of a system install — a real
follow-up, not done yet. **CD (automatic deployment) is intentionally not part of this
workflow** — deploys stay manual via the `/deploy-web` skill (`11-Deployment-Guide.md` §2),
by explicit decision: a single operator wants to control the moment of deploy, and the
skill's own pre-deploy smoke-test steps are a deliberate pause, not friction to automate
away.

This workflow will grow a new job per component the moment that component gets its first
real test — not before (an empty "build-only, no tests" job for a component with zero test
coverage adds CI runtime for no verification value).

## 5. Test environments

Not formally documented anywhere in the codebase examined. Inferred from `App.config`/env
patterns: the Website supports a `localhost`-conditional code path (`createTestUser` in
`/api/subscription/confirm`, per `06-API-Specification.md` §2) suggesting some informal
local-dev testing convention exists, but no separate "test" or "staging" AWS environment
configuration was found distinct from production. This is itself a gap worth flagging: the
existing Vitest suite mocks the AWS SDK clients directly rather than hitting a real
test-tier AWS account, which is appropriate for unit/integration tests but leaves no
environment for a true end-to-end smoke test against real infrastructure.

## 6. Entry/exit criteria (proposed, since none exist today)

- **Entry** for adding tests to an area: the area appears in §4.2, or a bug is found in it
  (regression-driven addition is always in scope regardless of priority ranking).
  - Because the `verify` skill's guidance already asks that non-trivial product changes be
      exercised end-to-end before considering them done, any new feature work should also
      add a test at the same time, not defer it — the current gap is legacy debt, not a
      precedent to continue.
- **Exit** (a given area is "adequately tested"): every branch identified in that area's
  corresponding Test Cases document (`test-cases/*.md`) has at least one passing automated
  test, or an explicit documented reason it's covered manually instead (e.g. the
  Announcement-email confirmation dialog, which is inherently a manual/UI concern for a
  desktop app with no UI-automation tooling in place — see `04-SRS-Uploader.md` NFR-3).

## 7. Roles

Single-operator platform (per `00-Overview.md` §4) — no separate QA role exists or is being
proposed here. The AI coding agent (Claude Code) is expected to write and run tests as part
of implementing changes, per this project's standing engineering practice, and to flag when
a change touches an area from §4.2 that still has no coverage.
