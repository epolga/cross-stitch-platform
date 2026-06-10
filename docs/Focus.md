# Focus

## Current goal

Milestone 10b — Repo consolidation cleanup.

## Active work

Nothing in flight. All 2026-06-10 session work committed and deployed.

## What was built (sessions through 2026-06-05)

### Milestone 7 — Lambda pipeline
- Single Lambda `cross-stitch-daily-pipeline`, EventBridge at 02:00 UTC (05:00 local)
- 13-step pipeline: daily business → history → promoted ads → landing pages → pin attribution → anomaly detection → anomaly notifications → AI trend → recommendation change alert → design pin map → design performance → AI design analysis → daily summary email
- Node.js 20 → 22 everywhere (Lambda runtime, esbuild target, EB platform, local nvm)
- `\PinterestDailyReport` and `\GoogleTokenRefreshReminder` Windows tasks disabled

### Milestone 8 — Alerts & Telegram
- Anomaly detection + email alerts
- Recommendation change alert email
- Telegram bot: daily summary, anomaly alerts, recommendation changes, Google token reminder

### Milestone 9 — Per-pin attribution + A/B test
**PIN_ATTRIBUTION DDB entity** — written daily by Lambda step 5
- Fields: date, adId, title, destinationUrl, clicks, outboundClicks, spend (USD), paidSessions, attributedRevenue (ILS), profit (ILS), usdIlsRate

**Currency fix** — spend is USD, revenue/profit are ILS
- Live USD→ILS rate from Bank of Israel API; fallback: last known rate from DDB
- `scripts/daily-business-report.ts` stores `usdIlsRate` in DAILY_BUSINESS rows

**Daily email** — per-pin 7-day trend table + A/B test section (DESIGN vs ALBUM)
**Telegram** — top-3 pins by today's profit

**A/B test conclusion** (2026-06-08) — dropped
- Result: ALBUM pins get ₪0 attributed revenue (visitors land on album page, no AdSense)
- ALBUM vs DESIGN: -34% impressions/pin, -100% clicks, saves, CTR
- 102 album pins across 29 albums still exist in Pinterest but will not be promoted
- Removed A/B section from daily email; deleted `scripts/ab-test-report.ts`

## Pending

### What was built in the 2026-06-10 session

**Homepage 500 — fixed**
- Root cause: `.next` cache pollution from `next dev` sessions. Path-based webpack IDs from dev bled into `next build` for the homepage's `page_client-reference-manifest.js` → TypeError on SSR → 500.
- Fix: always delete `.next` before production build. Clean build produces all-numeric webpack IDs.
- Always run `rm -rf .next` before `next build` (step 1 of `deploy-web.md` already covers this).

**Next.js upgraded 15.5.7 → 15.5.18**
- Latest 15.x patch; includes security fixes. `package.json` + `package-lock.json` committed.

**Mobile LCP fix — Milestone 9b**
- Root cause: 250px top AdSlot pushed design images below the fold on mobile → `priority` images had no effect.
- Fix: `hidden md:block` on top AdSlot — hidden on mobile, visible on desktop.
- Result: LCP 1.9s (Lighthouse mobile, localhost), CLS 0, TBT 0ms, Performance score 98.

### Milestone 9b — Mobile Core Web Vitals
Search Console: 68 mobile "needs improvement", 68 desktop "good".
- [x] LCP fix: `priority={true}` on first 4 images in DesignList — 2026-06-06
- [x] LCP fix: hide top AdSlot on mobile (`hidden md:block`) — 2026-06-10, LCP now 1.9s
- [ ] CLS fix: AdSlot top reservation — fixed-height wrapper instead of `min-height` to prevent shift when ad renders smaller than 250px

### Milestone 10 — WPF Uploader AI integration (~3–5 days)
- AI title, board, and keyword suggestions when creating a new Pinterest pin in the WPF uploader
- Entry point: `uploader/` project
- SEO description generation (Claude Haiku) — done 2026-06-07:
  - `AnthropicApiKey` added to `App.private.config` (was missing — caused "API unavailable")
  - "Generate SEO Description" button in More Actions — generates + saves `SeoDescription` to DDB for current loaded design

### Milestone 9 — skipped item (low priority)
- AdSense URL channels / per-page revenue — session-based proportional attribution is good enough for now

### Milestone X — Repo consolidation cleanup (~0.5–1 day)
Multiple standalone repos had their content physically relocated into this `cross-stitch-platform` monorepo (not git-merged — histories are separate). Need to verify everything still works correctly from the new locations:
- [ ] Web app builds and deploys from monorepo (`web/`)
- [ ] WPF Uploader builds from monorepo (`uploader/`)
- [ ] Lambda pipeline deploys from monorepo (`automation/`)
- [ ] Email template path resolves correctly (see Operational notes — `%CROSS_STITCH%` issue)
- [ ] No leftover hardcoded paths pointing to old standalone repo locations in configs, scripts, or docs
- [ ] Decide whether to archive or delete the old standalone repos on GitHub

## Operational notes

### Email template path — verify tokens come from the right file
`App.config` sets `HtmlEmailTemplatePath` / `TextEmailTemplatePath` via `%CROSS_STITCH%\Uploader\Uploader\Templates\...`.
`%CROSS_STITCH%` defaults to `D:\ann\Git`, so templates are read from the **standalone `D:\ann\Git\Uploader\` repo**, not from `cross-stitch-platform\uploader\`.
Editing the wrong copy (e.g. `cross-stitch-platform\uploader\Uploader\Templates\`) has no effect.
- [ ] Decide on a single canonical template location and update `App.config` (or set `%CROSS_STITCH%`) so both repos point to the same file — eliminates the confusion permanently.

### EB restart → 502 Bad Gateway (expected)
`RestartAppServer` kills and restarts the app server processes. nginx comes up almost instantly, but Node.js takes ~15–30 seconds to start. During that gap nginx has no upstream → 502. **This is normal — just wait and reload.** Not a sign of a broken deployment.

## Out of scope (do not touch)

- Meta / Reddit / TikTok expansion (Milestone 11 — future)
- Semi-autonomous assistant (Milestone 12 — future)
- Controlled automation (Milestone 13 — long-term)

## Done when

- [x] Lambda pipeline (Milestone 7) — deployed 2026-06-03, Windows tasks disabled 2026-06-05
- [x] EB platform upgrade — 6.9.0 → 6.11.1, completed 2026-06-04
- [x] Recommendation change alert email (Milestone 8) — deployed 2026-06-04
- [x] Telegram bot — daily summary, anomaly alerts, recommendation changes, Google token reminder — 2026-06-04
- [x] Per-pin profit trend in daily email (PIN_ATTRIBUTION, 7-day trend, top-3 Telegram) — 2026-06-05
- [x] Currency fix: spend USD / revenue ILS / profit ILS with live Bank of Israel rate — 2026-06-05
- [x] Node.js 20 → 22 everywhere — 2026-06-05
- [x] A/B test report: DESIGN vs ALBUM pin destination, in daily email + standalone script — 2026-06-05
- [ ] Remove local service: uninstall Windows task + delete daily-run.bat — after 2026-06-06 Lambda confirms
- [x] Milestone 9b LCP fix: priority images in DesignList — 2026-06-06
- [x] Milestone 9b LCP fix: hide top ad on mobile, LCP 1.9s — 2026-06-10
- [x] Homepage 500 fixed: clean build clears manifest cache pollution — 2026-06-10
- [x] Next.js upgraded 15.5.7 → 15.5.18 — 2026-06-10
- [ ] Milestone 9b CLS fix: AdSlot fixed-height wrapper
- [ ] Milestone 10: WPF Uploader AI integration
