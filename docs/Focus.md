# Focus

## Current goal

S8 — Search analytics (in progress). After S8: S7 converter (stitchable PDF chart).

## Active work

S8 implementation starting now.

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

## Planned work

### S8 — Search analytics

**Goal:** understand what users search for, catch zero-result queries, surface trending terms.

**What to log** (server-side, from API routes):
- Query text, timestamp, source (`text` / `image`), result count, filters applied

**Storage:** new DDB entity type `SEARCH_LOG` in `CrossStitchItems` table
- PK: `SEARCH_LOG`, SK: `{ISO-timestamp}#{nanoid}`
- Fields: `query`, `source`, `resultCount`, `filters` (JSON), `ttl` (90 days, Unix epoch)

**Reporting:** `scripts/search-analytics.ts` (`npm run search-analytics`)
- Top 20 queries by frequency (last 30 days)
- Zero-result queries (resultCount = 0)
- Daily search volume

**Instrumentation points:**
- `/api/ai-search` — log after resolving filters; resultCount comes from a `fetchFilteredDesigns` call
- `/api/image-search` — log after semantic search returns designIds

---

### S7 converter — Stitchable PDF chart

**Goal:** user uploads a photo → downloads a ready-to-stitch cross-stitch PDF pattern.

**Pipeline:**
1. Upload photo (new tab "Convert to pattern" in HeroSearch, reuse drag-drop UI)
2. Resize to target stitch grid (user picks: 50×50 / 80×80 / 100×100)
3. Quantize pixel colors → nearest DMC thread color (Euclidean RGB distance)
4. Limit palette to N colors (10 / 15 / 20) — merge least-used into nearest neighbor
5. Generate PDF:
   - Page 1: color preview grid (cells filled with DMC color)
   - Page 2+: symbol grid (unique symbol per DMC color, for B&W printing)
   - Final page: color key — symbol | DMC number | color name | stitch count
6. Return PDF for immediate download

**Key assets:**
- `web/src/data/dmc-colors.json` — ~500 DMC colors with RGB + name (public dataset)

**Libraries:**
- `sharp` — resize + per-pixel color extraction
- `pdf-lib` — pure-JS PDF generation (no native deps)

**Complexity:** ~3 days. Main risks: PDF layout quality, color accuracy on complex photos.

---

## History

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

### What was built in the 2026-06-11 session

**Windows task cleanup**
- Deleted `\PinterestDailyReport` and `\GoogleTokenRefreshReminder` from Task Scheduler (were disabled since 2026-06-05, now removed).

**Mobile CLS fix — Milestone 9b**
- Extended `hidden md:block` to top AdSlot on design pages, albums list, and album detail (homepage already had it from 2026-06-10).
- `AdSlot` component restructured: `<ins>` now wrapped in `<div class="ad-slot-wrapper">` — separates layout concerns from the AdSense-managed element.
- Key finding: AdSense injects `height: auto !important` and `max-height: none !important` inline on any ancestor div with a height constraint — CSS-only CLS prevention on the wrapper is not possible.
- Net result: top ad CLS eliminated on mobile (ad absent). Bottom ad CLS is below the fold when page loads → off-screen shifts are not counted by Core Web Vitals.
- Search Console improvement expected in 1–2 weeks.

**Milestone 10b — Repo consolidation cleanup**
- Archived 4 standalone GitHub repos: `epolga/cross-stitch`, `epolga/Uploader`, `epolga/AutoPinner`, `epolga/CrossStitch.Shared` (content now in monorepo).
- `SuppressedListPath` in `MainWindow.xaml.cs`: moved from old `D:\ann\Git\cross-stitch\` to `uploader/data/list-suppressed.txt` in monorepo; created empty file.
- `ConverterExePath`: added comment clarifying it's an intentionally external tool repo.
- Stale comment in `MainWindow.xaml.cs` updated (was referencing `cross-stitch-platform-docs` path).
- AutoPinner README: Task Scheduler example paths updated from old `AutoPinner` repo to monorepo.
- `cross-stitch-platform-docs` left live — Lambda still reads `platform-config.json` and `AlbumBoards.csv` from it.

### Milestone 9b — Mobile Core Web Vitals
Search Console: 68 mobile "needs improvement", 68 desktop "good".
- [x] LCP fix: `priority={true}` on first 4 images in DesignList — 2026-06-06
- [x] LCP fix: hide top AdSlot on mobile (`hidden md:block`) — 2026-06-10, LCP now 1.9s
- [x] CLS fix: hide top AdSlot on mobile for all page types; AdSlot wrapper div — 2026-06-11

### Milestone 10 — WPF Uploader AI integration (~3–5 days)
- AI title, board, and keyword suggestions when creating a new Pinterest pin in the WPF uploader
- Entry point: `uploader/` project
- SEO description generation (Claude Haiku) — done 2026-06-07:
  - `AnthropicApiKey` added to `App.private.config` (was missing — caused "API unavailable")
  - "Generate SEO Description" button in More Actions — generates + saves `SeoDescription` to DDB for current loaded design

### Milestone 9 — skipped item (low priority)
- AdSense URL channels / per-page revenue — session-based proportional attribution is good enough for now


### What was built in the 2026-06-23/24 session

**S2 — Faceted filters** (deployed 2026-06-23 `e5c0250`)
- Subject (9 categories / 128 albums), size, orientation, beginner-friendly; collapsible advanced filters

**S3 — Visual similarity search** (deployed 2026-06-24)
- Titan Multimodal Embeddings v1 (Bedrock) for all 5,260 designs; combined image+text vector `W = [√0.75 × img, √0.25 × txt]`
- Top-20 neighbors precomputed; stored in S3 (`embeddings/similar-designs.json`, 543 KB)
- "You may also like" 6-column grid on every design page; server-side with in-process S3 cache
- Credential fix: removed IAM user keys from `.env.local`; EB now uses EC2 instance role for S3

**S1 — Image SEO** (deployed 2026-06-24)
- JSON-LD `<script type="application/ld+json">` on every design page (was broken as `<meta>` tag)
- `SeoDescription` (Claude-generated, from DDB) now used as primary meta description
- Image sitemap: `<image:image>` blocks added to all 5,260 design URLs in `sitemap.xml`
- Alt text: all image tags now use `"X cross-stitch pattern"` format site-wide

**S4 — Semantic text search** (deployed 2026-06-24)
- Bedrock Titan text embeddings for all 5,260 designs already in `vectors.json` (from S3)
- Query embedded at request time; dot-product against stored text vectors; top-60 returned
- Runs in parallel with AI filter search in HeroSearch; results merged via `semanticIds` URL param
- Designs sorted by semantic rank when `semanticIds` present; AI filters still apply as constraints
- IAM: `AmazonBedrockFullAccess` added to EB EC2 instance role

**S7 — Search by image** (deployed 2026-06-24 `516f04e`)
- Tab toggle in HeroSearch: "Text search" / "Search by image"
- Drag-and-drop upload; Claude Haiku describes image → semantic text search → top-60 results
- Image never stored; held in memory ~1–2 s then discarded; description shown to user
- Fixed `imageVec`/`textVec` field name bug that zeroed all semantic dot products in production

**S5 — Session-based personalization** (deployed 2026-06-24)
- `DesignViewTracker` (client component): records design ID to `sessionStorage` on every design page view (cap 10)
- `POST /api/personalized`: takes up to 5 most-recent viewed IDs → round-robin neighbor lists from `similar-designs.json` → top-12 unseen candidates → full Design objects
- `PersonalizedSection` (client component): reads sessionStorage on homepage mount, fetches `/api/personalized`, renders horizontal scroll row of 12 thumbnails
- Placed after `<DesignListWrapper>` (below the fold) — zero CLS impact

---

## Operational notes

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
- [x] Remove local service: deleted PinterestDailyReport + GoogleTokenRefreshReminder Windows tasks — 2026-06-11
- [x] Milestone 9b LCP fix: priority images in DesignList — 2026-06-06
- [x] Milestone 9b LCP fix: hide top ad on mobile, LCP 1.9s — 2026-06-10
- [x] Homepage 500 fixed: clean build clears manifest cache pollution — 2026-06-10
- [x] Next.js upgraded 15.5.7 → 15.5.18 — 2026-06-10
- [x] Milestone 9b CLS fix: AdSlot fixed-height wrapper + hide top ad on mobile for all pages — 2026-06-11
- [x] Milestone 10b: repo consolidation cleanup — archive 4 standalone repos, fix all stale paths — 2026-06-11
- [x] Milestone 10a: AI title suggestions — 3 radio buttons, Sonnet 4.6, board suggestion, re-generate, titleOverride in upload — 2026-06-11 `59b3421`
- [x] Milestone 10 remaining: board suggestion constrained to AlbumBoards.csv board names — 2026-06-12 `ca01c00`
- [x] Milestone 10 remaining: manual end-to-end test confirmed working — 2026-06-24
- [x] S2 — Faceted filters: subject (9 categories / 128 albums), size, orientation, beginner-friendly; collapsible advanced filters — deployed 2026-06-23 `e5c0250`
- [x] S3 — Visual similarity search: Titan embeddings (5,260 designs), compute-similar-designs, "You may also like" UI block on design pages — 2026-06-24
- [x] S1 — Image SEO: JSON-LD structured data, SeoDescription in meta, image sitemap, alt text site-wide — 2026-06-24
- [x] S4 — Semantic text search: Titan text embeddings, parallel search in HeroSearch, semanticIds ranking — 2026-06-24
- [x] S7 — Search by image: Claude Haiku vision → semantic text search, tab toggle in HeroSearch, fixed imageVec/textVec bug — 2026-06-24 `516f04e`
- [x] S5 — Session-based personalization: DesignViewTracker + /api/personalized + PersonalizedSection homepage row — 2026-06-24
