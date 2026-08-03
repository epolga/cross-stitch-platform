# Cross-Stitch.com — Site Technology Milestones

## Purpose

This document tracks milestones for improving Cross-Stitch.com's site technology: search, discovery, performance, SEO, and monetization tools.

These are distinct from the Pinterest AI Agent pipeline milestones (see `Pinterest AI Agent — Milestones and Roadmap.md`).

Source analysis: `docs/technology_opportunities_for_cross_stitch_com.md`.

## Standing protocol: AI-assisted product decisions

Before starting any milestone/task here estimated at more than a couple of
days, run it through this decision gate (full reasoning and examples in
`AI_Product_Decision_Guide_ChatGPT.md`):

1. **Label claims explicitly** — FACT (backed by data) / INFERENCE (reasonable
   read of the facts) / HYPOTHESIS (untested) / UNKNOWN (no data yet). Don't
   let a plausible hypothesis get treated as an established fact.
2. **Pre-mortem** — assume the task shipped and turned out to be a waste of
   time six months later; list the likely reasons why, *before* building.
3. **Strongest argument against** — ask for it explicitly, don't rely on it
   surfacing unprompted.
4. **Cheapest test first** — don't build the full feature before its value
   can be checked more cheaply (a limited rollout, a manual version, a
   single-metric proxy).
5. **Success/failure criteria set in advance** — decide what "working" and
   "not working" look like *before* the data comes in, not after.
6. **Opportunity cost** — what does this task displace this week, and is
   that trade worth it.
7. **Competitor-has-it is not evidence** — a competitor shipping X only
   means "investigate whether our users have the same problem," not "build
   X."
8. **Don't let sunk cost argue for continuing** — "already a week in" isn't
   a reason; "the remaining work is worth it" is.

Standing instruction for the AI side of this loop: don't default to agreeing
with the proposed idea — surface the strongest case against it, label
fact vs. inference vs. hypothesis, and say "we don't know" rather than
inventing a probability when the data isn't there.

---

# Milestone S1 — Image SEO & Modern Delivery

## Status

Complete — 2026-06-24.

## Completed work

* **JSON-LD structured data** — moved from `metadata.other` (rendered as a broken `<meta>` tag) to `<script type="application/ld+json">` in JSX; schema type `CreativeWork` with name, description, image, url, `isAccessibleForFree`, creator
* **`SeoDescription` in metadata** — Claude-generated field from DDB now used as primary `<meta name="description">` and Open Graph description when present; falls back to mechanical description
* **Image sitemap** — all 5,260 design URLs in `sitemap.xml` include `<image:image>` blocks with title and caption; image xmlns enabled on `SitemapStream`
* **Alt text** — all image tags now use `"X cross-stitch pattern"` format: design page main image, "You may also like" grid, homepage/album `DesignList` cards, profile votes thumbnails
* **Modern delivery** — already handled by `next/image` (WebP/AVIF, responsive srcset, lazy loading, priority for LCP); CloudFront CDN already in place
* Deployed 2026-06-24 `823bf34`, `35c2f98`

## Goal

Improve image discoverability and page performance with SEO metadata and modern delivery formats.

## Planned work

**Image SEO**

* Automated generation of accurate `alt` text, Open Graph metadata, image dimensions, structured data, image sitemap entries
* Descriptive filenames for new uploads (e.g. `colorful-geometric-cat-cross-stitch-pattern-5341.webp`)
* Existing image URLs must not be renamed without a redirect plan — apply metadata improvements in place; migrate URLs only where the SEO benefit justifies the risk

**Modern delivery**

* AVIF or WebP variants
* Responsive `srcset` with correct width/height attributes
* Lazy loading below the fold; priority loading for the main design image (do not lazy-load if it is the LCP element)
* CDN caching for thumbnails
* Assess with real PageSpeed and Core Web Vitals measurements

## Priority

**High.** For a visual site, image SEO can be more valuable than adding a chatbot.

---

# Milestone S2 — Structured Filters & Faceted Browsing

## Status

Complete — 2026-06-23.

## Completed work

* Subject filter: 9 categories mapped to 128 albums (DynamoDB AlbumID lookup)
* Size filter (small / medium / large by stitch count)
* Orientation filter (portrait / landscape / square)
* Beginner-friendly filter (≤ 4 colors, ≤ 900 stitches)
* Collapsible "Advanced filters" panel for secondary options
* All filters reflected in URL query params; shareable / bookmarkable
* SEO: filter combinations not indexable by default (no static pages generated)
* Deployed 2026-06-23 `e5c0250`

## Goal

Add practical filters that match how users actually choose cross-stitch designs.

## Planned filters

* subject, difficulty, size, number of colors
* beginner-friendly, seasonal theme
* geometric or traditional style
* portrait or landscape orientation
* background complexity, monochrome or multicolor

## SEO caution

Only curated, high-value filter combinations should be indexable. Low-value combinations should use canonical rules, `noindex`, or remain client-side only.

## Priority

**High.** Improves ordinary navigation and provides a stronger base for semantic search.

---

# Milestone S3 — Visual Similarity Search

## Status

Complete — 2026-06-24.

## Completed work

* **Embedding batch** (`automation/pinterest-agent/scripts/compute-embeddings.ts`) — Titan Multimodal Embeddings v1 via Amazon Bedrock; 1024-dim image + text vectors for all 5,260 designs; stored in `s3://cross-stitch-sitemap-cache/embeddings/vectors.json` (43 MB)
* **Similar-designs compute** (`scripts/compute-similar-designs.ts`) — combined vector `W = [√0.75 × imgVec, √0.25 × txtVec]` (2048-dim, unit-length); top-20 nearest neighbors per design via min-heap; result stored in `embeddings/similar-designs.json` (543 KB, 5,260 entries); ~113 s runtime
* **Web lib** (`web/src/lib/similar-designs.ts`) — singleton S3 fetch with in-process cache; resolves design IDs to full `Design` objects via DynamoDB
* **"You may also like" UI block** (`web/src/app/designs/[designId]/page.tsx`) — 6-column responsive grid, compact image cards with title link and hover state; rendered server-side in the `Promise.all` alongside the main design fetch
* **Credential fix** — removed hardcoded IAM user keys from `.env.local`; EB instances now use EC2 instance role (`AmazonS3FullAccess`) for S3 reads instead of overriding with a key that lacked access to the `embeddings/` prefix

## Goal

Add a **Similar Designs** block to every design page using visual image embeddings.

## Planned work

* Generate image embeddings for all ~5,500 designs
* Store in a compact binary or JSON index — no external vector DB needed at this catalog size
* Precompute 12–20 nearest matches per design at deployment time
* Display the similar-designs block on each design page

## Potential benefits

* Better internal linking; more page views per visit
* Easier discovery of older, low-traffic designs
* More relevant than category-based links
* No new AI-written content required

## Priority

**Very high.**

---

# Milestone S4 — Semantic Text Search

## Status

Complete — 2026-06-24.

## Completed work

* **`web/src/lib/semantic-search.ts`** — loads `embeddings/vectors.json` from S3 (singleton, `Float32Array` cache ~21 MB); embeds user query via Bedrock Titan Multimodal (`amazon.titan-embed-image-v1`); dot-products query vector against all 5,260 stored text vectors; returns top-60 design IDs in ranked order
* **`/api/semantic-search`** — POST `{query}` → `{designIds: number[]}`; non-fatal (AI filter results still shown if Bedrock fails)
* **`HeroSearch.tsx`** — runs `/api/ai-search` and `/api/semantic-search` in parallel (`Promise.allSettled`); passes `semanticIds` as a URL param alongside AI filter params
* **`data-access.ts`** — `semanticIds` added to `FilterOptions`; when present, filters to those IDs and sorts by semantic rank instead of default DesignID-desc
* **`page.tsx`** — parses `semanticIds` from URL in both `Home` and `generateMetadata`
* **IAM** — `AmazonBedrockFullAccess` attached to `aws-elasticbeanstalk-ec2-role`
* Cold-start latency: ~3–5 s on first query (vector load + Bedrock embed); ~500 ms after cache warm
* Deployed 2026-06-24 `cc5e1b2`

## Goal

Allow natural-language queries: "simple colorful cat", "small Christmas pattern for beginners", "geometric bird without background".

## Planned work

* Text and image embeddings for all designs (reuses Milestone S3 infrastructure)
* Convert the user's query into an embedding and return closest semantic matches
* Combine semantic ranking with existing filters (category, difficulty, size, color count)

## Priority

**High.** Most valuable after visual similarity search (S3) is in place.

---

# Milestone S5 — Session-Based Personalization

## Status

**Done, including differentiated categories (2026-08-03).** Core mechanism
(`PersonalizedSection.tsx` + `POST /api/personalized`) was already live; the
remaining "differentiate beyond generic similarity" work shipped 2026-08-03
by reusing existing derived facets instead of adding new computation:
`colorBucket`/`sizeCategory`/`subject` (`data-access.ts`, already used
elsewhere for filters) are now compared between each candidate and the
viewed design it was matched against, tagging candidates `simpler`,
`larger`/`smaller` (same `subject`, different `sizeCategory`), or
`similar-palette` (same `colorBucket`) where applicable. `PersonalizedSection.tsx`
shows a small label on the thumbnail when a tag applies; untagged
(generic-similarity) candidates still render with no label, same as before.
Deliberately labeled "Similar color count" rather than "Same palette" in
the UI — there's no actual per-design DMC color-list data behind this
(only `NColors`-derived buckets), so the honest claim is complexity-tier
similarity, not literal shared colors. Verified against real data
(`DesignID 4217`, colorBucket `few`/sizeCategory `small`/subject `animals`):
correctly produced `similar-palette` and `larger` tags, and correctly
produced *no* `simpler` tags since `few` is already the lowest tier.

## Goal

Recommend designs based on the visitor's current session — no user accounts or long-term tracking.

## Completed work

* `viewed_designs` tracked client-side in `localStorage` (not
  `sessionStorage`, but same no-account/no-server-tracking property)
* `/api/personalized` takes the last 5 viewed design IDs, pulls each one's
  nearest neighbors via the Milestone S3 visual-embedding infrastructure
  (`getSimilarIds`), round-robins across the neighbor lists so all viewed
  designs get equal influence, returns up to 12 designs
* Rendered on the homepage only, below the fold
* **2026-08-03:** candidates tagged `simpler` / `larger` / `smaller` /
  `similar-palette` relative to the viewed design they matched against,
  surfaced as a label on the thumbnail (see Status above for exact logic
  and caveats)

## Remaining work

None currently planned.

## Priority

**Medium.**

---

# Milestone S6 — Performance Optimization

## Status

Future — Phase 3. **Baseline measured 2026-08-03** (first step, per this
milestone's own caution to measure before changing anything) — see below.
No prefetch/`content-visibility` work started yet.

## Baseline (2026-08-03)

Measured live on `cross-stitch.com` via a real Chromium tab (Playwright),
reading `largest-contentful-paint`/`layout-shift`/navigation-timing entries
directly off the Performance API — **not** PageSpeed Insights/Lighthouse
(Google's anonymous PSI API quota was exhausted for the day) or CrUX field
data. Single unthrottled desktop run per page, not a median of several or a
simulated slow-mobile/3G profile — a real but limited baseline; redo with
Lighthouse (mobile, throttled) or CrUX once available for a more standard
comparison point.

| Page | TTFB | FCP | LCP | LCP element | CLS | Load event | Transfer size | Resources |
|---|---|---|---|---|---|---|---|---|
| `/` (homepage) | 200ms | 832ms | 832ms | `<p>` (text block) | 0 | 963ms | 34.6 KB | 95 |
| `/Horseshoe-16-53-Free-Design.aspx` (design page) | 212ms | 296ms | 896ms | `<img>` design photo (CloudFront) | 0.001 | 2258ms | 25.2 KB | 70 |
| `/albums` | 186ms | 276ms | 276ms | `<p>` (text block) | 0 | 375ms | 17.2 KB | 181 |

Observations:
* All three LCP values are well under the "good" 2.5s threshold and CLS is
  effectively zero everywhere — no urgent problem visible in this baseline.
* Homepage and `/albums` LCP element is a text paragraph, not an image —
  `content-visibility` work should keep this in mind (the caution below
  about not touching "the main image" doesn't fully cover these two pages;
  double-check what text block is actually the LCP candidate before hiding
  anything above it).
* Design page's `loadEvent` (2258ms) is much higher than its LCP (896ms)
  and than the other two pages' load events — worth a closer look before
  assuming prefetch/`content-visibility` is the highest-value next step
  there specifically.
* Noticed in passing, not investigated: browser console showed 33 errors
  on the design page and 18 on `/albums` during this session (vs. 0-10 on
  the homepage across two loads) — unclear if consistent/meaningful or
  session noise (ad/tracker-related is plausible), flagging for awareness
  only, out of scope for this baseline pass.

## Planned work

* Selective prefetching for next/previous design, hovered recommendation cards, first search result — verify what Next.js already handles before adding custom logic
* `content-visibility: auto` on below-the-fold sections (related-design grid, footer, secondary recommendations)
* Measure with real PageSpeed and Core Web Vitals data before and after each change

## Cautions

* No full prerendering — breaks ads, analytics, and page-view tracking
* Do not apply `content-visibility` to the main design image or any likely LCP element
* Incorrect intrinsic sizing causes layout shifts; test carefully

## Priority

**Medium.** Introduce only after measuring current navigation performance.

---

# Milestone S7 — New Traffic Tools

## Status

**Updated 2026-07-26 — converter v1 built, integrated, and live** (was
"remaining" as of 2026-06-24; that was stale). Search by image done
2026-06-24; the photo-to-cross-stitch converter (`/photo-to-cross-stitch`)
shipped and was integrated into the main site shortly after, and has since
received real feature work on top of v1 (DMC-matched color quantization,
multi-page PDF chart export with a color key, and — 2026-07-26 — a
3-stitch overlap between chart pages so a color band that shifts across a
page boundary can be aligned, built from a real user feature request).
Advanced v2 items below remain unbuilt.

## Completed work

**Search by uploaded image** — deployed 2026-06-24 `516f04e`

* Tab toggle in HeroSearch: "Text search" / "Search by image"
* Drag-and-drop or click-to-upload (JPEG/PNG/WebP, max 5 MB)
* Claude Haiku (vision) describes the uploaded image in plain text
* Description fed into existing semantic text search → top-60 matching designs
* Claude's description shown to user ("Searching for: …") so they can verify intent
* Image never stored — held in memory for ~1–2 s during Claude API call, then discarded
* Also fixed: `imageVec`/`textVec` field name bug in `semantic-search.ts` that was silently zeroing all dot products (affected both image and text semantic search in production)

**Photo-to-cross-stitch converter v1** — live at `/photo-to-cross-stitch`

* Image → cross-stitch grid: color quantization down to a limited palette, matched against real DMC thread colors (exceeds the original "no generative AI required for v1" scope only in that it's a full palette-matching pipeline, not just resizing/reduction)
* Multi-page PDF export (chart pages with symbols/colors + color key), including a 3-stitch overlap between adjoining pages (2026-07-26)
* Drag-and-drop or file upload, same pattern as image search above

## Planned work

**Search by uploaded image** — ✅ done

**Photo-to-cross-stitch converter v1** — ✅ done (see Completed work above)

**Photo-to-cross-stitch converter v2 (not started)**

* Background removal, edge preservation, face/subject emphasis
* Confirmed not in the codebase as of 2026-07-26 (checked directly, not assumed)

## Risks (converter)

* Users may expect professional quality immediately
* Complex images produce poor results without careful simplification
* Needs clear limits and realistic preview messaging
* Copyright and privacy notices required

## Priority

* Search by image: **Medium to high** (after S3) — done
* Converter v1: **Medium** — done
* Converter v2 (background removal etc.): not yet prioritized

---

# Milestone S8 — Framework Modernization

## Status

Future — Phase 5. Deferred until Phases 1–4 are measured and stable.

## Goal

Evaluate newer Next.js caching and partial-rendering in a separate branch before committing to an upgrade.

## Planned evaluation

* Test representative pages on a dedicated branch
* Compare: build stability, server response time, LCP, INP
* Check legacy `.aspx` routes, verify analytics and advertising behavior

## Why deferred

The site already has mostly static design pages, third-party advertising scripts, recent Turbopack-related issues, and active SEO experiments. A framework upgrade makes it harder to isolate the cause of performance or traffic changes.

## Priority

**Low to medium.**

---

# Ongoing: AI Search Performance Monitoring

## What to watch

* New Search Console reporting for AI-assisted search features
* Compare pages appearing in AI search with those performing well in normal search
* Track whether AI visibility produces clicks or only impressions
* Identify which design types and page structures are most frequently selected

## Important principle

No need to create thousands of AI-generated pages. The stronger strategy is to continue improving crawlability, indexability, internal linking, unique descriptions, image quality, structured data, clear page titles, and useful page content.

## Priority

**High for monitoring, low for development effort.** Mainly an analytics task.

---

# Recommended Implementation Order

## Phase 1 — Low-Risk, High-Value

1. Improve and automate image metadata (S1)
2. Review responsive image delivery (S1)
3. Strengthen structured filters (S2)
4. Monitor AI-related Google Search performance (Ongoing)
5. Measure the effect of current internal linking changes

## Phase 2 — Discovery and Engagement

1. Generate embeddings for all designs (S3)
2. Add a Similar Designs block (S3)
3. Precompute related-design lists (S3)
4. Add semantic text search (S4)
5. Add session-based recommendations (S5)

## Phase 3 — Performance

1. Review Next.js prefetch behavior (S6)
2. Add selective prefetching where useful (S6)
3. Test `content-visibility` on below-the-fold sections (S6)
4. Measure changes with real-user and laboratory data

## Phase 4 — New Traffic-Producing Tools

1. Add search by uploaded image (S7)
2. Build a basic photo-to-cross-stitch converter (S7)
3. Evaluate premium export or advanced conversion features (S7)

## Phase 5 — Framework Modernization

1. Test a newer Next.js version in a separate branch (S8)
2. Evaluate caching and partial rendering (S8)
3. Upgrade only if measurable benefits justify the risk (S8)
