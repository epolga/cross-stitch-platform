# Focus

## Current goal

S7 converter — stitchable PDF chart from photo.

## Active work

Nothing in flight.

## Next session

Integrate the converter into the main site flow — wire up the `/photo-to-cross-stitch` page so it connects end-to-end with the rest of the site (nav link, login-wall, saved patterns, etc.).

## Return to S8 analytics

Come back to S8 after ~2–4 weeks of traffic data has accumulated. Run
`npm run search-analytics` in `automation/pinterest-agent/` to see top queries
and zero-result queries worth acting on.

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

### S7 converter — Photo to cross-stitch pattern

#### Phase 1 — Browser preview + PDF export (building now, worktree: s7-converter)

**New page: `/convert`**

Upload → options → pattern preview → download PDF.

**Step 1 — Upload**
- Drag-drop or click to upload (JPEG/PNG/WebP, max 5 MB)
- Reuse same drag-drop UI pattern as image search

**Step 2 — Options** (user picks before converting)
- Width: number input (stitches, e.g. 50–200)
- Height: number input (stitches, e.g. 50–200) — independent from width
- Color count: fixed options — 10 / 15 / 20 / 25 DMC colors

**Step 3 — Pattern preview** (rendered in browser, scrollable)
- Canvas-based rendering (handles large grids better than CSS grid)
- Toggle: **Colored view** (cells filled with DMC color) vs **Symbol view** (B&W symbols for printing)
- Scrollable — no compression, no page splitting yet

**Step 4 — Download**
- "Download PDF" button → `POST /api/convert/pdf` → returns PDF
- PDF contains: colored grid page + symbol grid page + color key table

**Server pipeline (`/api/convert`):**
1. Decode image → resize to (width × height) using `sharp`
2. Extract pixel color array
3. Map each pixel to nearest DMC color (Euclidean RGB distance)
4. Merge smallest palette clusters until ≤ N colors
5. Assign each color a symbol (A–Z, then ①–⑳ etc.)
6. Return `{ grid: number[][], palette: DmcColor[] }` as JSON

**PDF generation (`/api/convert/pdf`):**
- Accepts `{ grid, palette }` JSON (client sends its current state)
- Builds PDF with `pdf-lib`: colored page + symbol page + key page
- Returns PDF bytes

**New files:**
- `web/src/data/dmc-colors.json` — ~500 DMC colors (RGB + name + number)
- `web/src/lib/pattern-converter.ts` — image processing + DMC mapping logic
- `web/src/app/api/convert/route.ts` — image → pattern JSON
- `web/src/app/api/convert/pdf/route.ts` — pattern JSON → PDF bytes
- `web/src/app/convert/page.tsx` — the UI
- `web/src/app/components/PatternCanvas.tsx` — canvas renderer (colored + symbol modes)

**New dependencies:** `sharp`, `pdf-lib`

---

#### Phase 2 — Visual editor (discuss later)

- Click a cell → open DMC color picker → repaint cell
- Fill bucket tool (flood fill)
- Undo / redo (useReducer history stack)
- Pencil / eraser tools
- Zoom in/out on the canvas

**To discuss:**
- Which tools are most important to start with?
- Should the color picker show all ~500 DMC colors or only the current palette?

---

#### Phase 3 — Advanced (discuss later)

- PDF export from the *edited* state (not just the auto-converted one)
- Save pattern to account (DDB) — come back and continue editing
- Share a pattern URL with others
- Import an existing pattern image (not a photo) and extract its palette

---

#### Deferred decisions (discuss before Phase 2)

1. **Color count control:** fixed options (10/15/20/25) vs free slider (5–30). Fixed for now — revisit when we see what users actually need.
2. **Cell size / zoom:** currently fixed + scrollable. Will add zoom controls in Phase 2.
3. **PDF layout:** currently one colored page + one symbol page + key. After seeing real output, may split large grids across multiple pages.
4. **Page size:** A4 or Letter? Cell size per page? Decide after seeing first PDF output.
5. **Max grid size:** no hard limit yet. May need to cap at e.g. 300×300 for performance (3 MB canvas). Evaluate after testing.
6. **Symbol set:** A–Z then ①–⑳. May need to revisit for large palettes (>46 colors).

---

### S8 — Search analytics (return after data accumulates)

**Already built:** `logSearch()` in web app logs every text/image search to `SearchQueries` DDB table with 90-day TTL. Report: `npm run search-analytics` in `automation/pinterest-agent/`.

**Return to this after ~2–4 weeks of traffic.** Actionable output:
- Zero-result queries → add missing designs or fix search
- Top queries → inform Pinterest pinning strategy
- Volume trends → measure impact of search improvements

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
