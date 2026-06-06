# Focus

## Current goal

Milestone 10 — WPF Uploader AI integration.

## Active work

Nothing in flight. All 2026-06-05 session work committed and deployed.

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

**A/B test report** (`npm run ab-test`) — `scripts/ab-test-report.ts`
- Reads DESIGN_PIN_MAP (now stores `pinLinkType`) + latest DESIGN_PERFORMANCE snapshot
- Groups by DESIGN vs ALBUM, shows per-pin avg impressions/saves/CTR/saves-per-day
- A/B section also added to daily email (text + HTML)
- `export-design-pin-map.ts` now reads `PinLinkType` from CrossStitchItems

## Pending

### Tomorrow (2026-06-06) — after Lambda run confirmed
- Check daily email: A/B section present + all 13 steps in CloudWatch logs
- If green: uninstall `\PinterestDailyReport` from Task Scheduler (currently disabled, not deleted)
- Delete `automation/pinterest-agent/daily-run.bat` (superseded by Lambda)
- Mark done below

### Milestone 9b — Mobile Core Web Vitals (~0.5 day)
Search Console: 68 mobile "needs improvement", 68 desktop "good".
- [ ] LCP fix: `priority={true}` on first 4 images in DesignList (above-the-fold eager load)
- [ ] CLS fix: AdSlot top reservation — fixed-height wrapper instead of `min-height` to prevent shift when ad renders smaller than 250px

### Milestone 10 — WPF Uploader AI integration (~3–5 days)
- AI title, board, and keyword suggestions when creating a new Pinterest pin in the WPF uploader
- Entry point: `uploader/` project

### Milestone 9 — skipped item (low priority)
- AdSense URL channels / per-page revenue — session-based proportional attribution is good enough for now

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
- [ ] Milestone 9b CLS fix: AdSlot fixed-height wrapper
- [ ] Milestone 10: WPF Uploader AI integration
