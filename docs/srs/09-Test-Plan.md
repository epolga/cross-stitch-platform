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
| **Website** (`web/`) | Vitest (`npm run test` → `vitest run`) | 10 files | See §2.1 |
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

**What this means concretely:** the only API surface with meaningful automated coverage is
the **saved-pattern CRUD** family (`/api/converter/patterns*`) plus two unrelated single
endpoints (`/api/profile/votes`, `/api/subscription/plan`). Every other route in
`06-API-Specification.md` — all of auth/registration, all of designs/albums, all of search,
`/api/convert` and `/api/convert/pdf` themselves (the conversion algorithm and PDF
generation are untested despite being the converter's core value), the PayPal webhook, and
every admin route — has **zero automated test coverage** today.

## 3. Test levels in use / available

| Level | Website | Pinterest automation | Uploader |
|---|---|---|---|
| Unit | Vitest, partial (§2.1) | None | None |
| Integration (API route + mocked AWS SDK) | Vitest, partial (the route.test.ts files mock DynamoDB clients) | None | None |
| End-to-end / UI | None found (no Playwright/Cypress config in `web/`) | N/A (no UI) | None (no UI automation for WPF found) |
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
- No end-to-end/browser test tooling exists for the Website despite it having the most
  test-relevant user flows (registration, download gating, checkout) of any component in
  the platform — out of scope for this plan's priority list (§4.2 focuses on the highest-
  risk *individual* flows first) but worth a separate follow-up decision once 1–5 are
  addressed.

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
