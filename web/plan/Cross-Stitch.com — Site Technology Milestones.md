# Cross-Stitch.com — Site Technology Milestones

## Purpose

This document tracks milestones for improving Cross-Stitch.com's site technology: search, discovery, performance, SEO, and monetization tools.

These are distinct from the Pinterest AI Agent pipeline milestones (see `Pinterest AI Agent — Milestones and Roadmap.md`).

Source analysis: `docs/technology_opportunities_for_cross_stitch_com.md`.

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

Future — Phase 2.

## Goal

Recommend designs based on the visitor's current session — no user accounts or long-term tracking.

## Planned work

* Track pages viewed in `sessionStorage` or browser memory
* Suggest: designs similar to pages already viewed, simpler alternatives, comparable color palettes, larger/smaller versions of the same subject
* Reuses visual embedding infrastructure from Milestone S3

## Priority

**Medium.**

---

# Milestone S6 — Performance Optimization

## Status

Future — Phase 3.

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

Future — Phase 4.

## Planned work

**Search by uploaded image**

* User uploads an image; system returns visually similar designs from the catalog
* Reuses visual embedding infrastructure from Milestone S3
* Image processed temporarily and deleted immediately; explained clearly to users

**Photo-to-cross-stitch converter**

* Basic browser tool: image resizing, color reduction, nearest-thread-color matching, downloadable grid preview
* No generative AI required for v1
* Advanced v2: background removal, edge preservation, face/subject emphasis, palette optimization, downloadable PDF patterns

## Risks (converter)

* Users may expect professional quality immediately
* Complex images produce poor results without careful simplification
* Needs clear limits and realistic preview messaging
* Copyright and privacy notices required

## Priority

* Search by image: **Medium to high** (after S3)
* Converter: **Medium** (largest stand-alone project in this set; strong organic traffic potential)

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
