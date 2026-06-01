# SEO Diagnosis Agent — Instructions for Olga

## Goal

Build an application that connects your existing data sources and explains why many `cross-stitch.com` pages are not indexed after the April/May 2026 Google indexing drop.

The first version should **diagnose and recommend**. It should not automatically change the website, generate thousands of descriptions, submit thousands of URLs, or modify production data.

## Current situation

Known facts:

- The site moved from `cross-stitch-pattern.net` to `cross-stitch.com` around January 1, 2026.
- `cross-stitch.com` is an old domain, but it was inactive for a long time.
- Around mid-April 2026, Google sent a message that `cross-stitch-pattern.net` could not be verified.
- Around late April / early May 2026, Google Search Console showed a sharp drop in indexed pages.
- Search Console currently shows many pages in:
  - `Crawled - currently not indexed`
  - `Alternate page with proper canonical tag`
- Canonical tags appear technically correct.
- Google seems to like album pages more than individual design pages.
- The main question is: which pages stayed indexed, which were removed, and why?

## What the application should answer

The application should produce evidence-based answers to questions like:

1. Are indexed design pages older than non-indexed pages?
2. Do indexed pages have more downloads?
3. Do indexed pages belong to certain albums?
4. Do indexed pages have more GA4 traffic?
5. Do indexed pages have Pinterest pins or Pinterest traffic?
6. Are album pages indexed better than design pages?
7. Are pages with inconsistent metadata less likely to be indexed?
8. Did the April/May drop affect specific URL types, albums, or the whole catalog?
9. What should be improved first: albums, design pages, internal links, Pinterest promotion, or content?

## Data sources to connect

### 1. DynamoDB

Use DynamoDB as the main source of truth for design metadata.

Useful fields may include:

- `DesignID`
- `AlbumID`
- `Caption`
- `Description`
- `Width`
- `Height`
- `NColors`
- `NDownloaded`
- `ImageUrl`
- `PdfUrl`
- `PinterestPinId`
- `PinterestPinUrl`
- URL / slug fields if available

### 2. Google Analytics 4

Use GA4 to measure real user behavior.

Useful metrics:

- sessions by page
- users by page
- engagement rate
- average engagement time
- events
- conversions if configured
- traffic source / medium
- Pinterest traffic vs Google traffic

### 3. Pinterest API

Use Pinterest data to understand external discovery signals.

Useful metrics:

- pin exists or not
- pin creation date
- impressions
- saves
- outbound clicks
- click-through rate
- linked landing page

### 4. Google Search Console API

This is the missing integration.

Use it for:

- URL indexing status
- last crawl date
- Google-selected canonical
- user-declared canonical
- search clicks
- search impressions
- CTR
- average position
- sitemap status

## Google Search Console setup checklist

1. Open Google Cloud Console.
2. Use the same Google Cloud project that already works with GA4 if possible.
3. Enable **Google Search Console API**.
4. Add OAuth scope:

```text
https://www.googleapis.com/auth/webmasters.readonly
```

5. Re-run OAuth login because adding a new scope requires new consent.
6. Confirm the OAuth account has access to the Search Console property:

```text
https://cross-stitch.com/
```

or the domain property if you use one.

7. Also check whether the old property still exists:

```text
https://cross-stitch-pattern.net/
```

## Important safety rules

The first version must be read-only.

It must not:

- update DynamoDB
- submit thousands of URLs for indexing
- change canonicals
- change sitemaps
- generate 5,500 AI texts
- update the website
- modify Pinterest campaigns

It may create local report files.

## First report to request

Ask Claude Code to create a report called:

```text
reports/seo-indexing-diagnosis-YYYY-MM-DD.md
```

and a machine-readable file:

```text
reports/seo-indexing-diagnosis-YYYY-MM-DD.json
```

The report should include:

1. Executive summary.
2. Counts:
   - indexed design URLs
   - non-indexed design URLs
   - indexed album URLs
   - non-indexed album URLs
3. Comparison table:
   - indexed vs not indexed
   - average downloads
   - median downloads
   - average GA4 sessions
   - average Pinterest outbound clicks
   - average design age
   - album distribution
4. Top likely causes.
5. Recommended actions ranked by expected benefit.
6. A 50-page experiment plan.
7. Data gaps and warnings.

## Recommended first experiment

Do not improve all 5,500 design pages.

Instead:

1. Select 50 non-indexed design pages.
2. Prefer pages from important albums or pages with existing demand.
3. Improve them with:
   - unique image-specific description
   - difficulty level
   - estimated stitching time
   - recommended fabric
   - related designs
   - links back to album page
4. Request indexing only for the experiment pages.
5. Wait 4–8 weeks.
6. Compare results against 50 similar non-improved pages.

## Strong recommendation

Focus first on album pages.

If Google likes albums more than individual designs, then the best recovery path may be:

```text
Pinterest ad → album page → related design pages
Google search → album page → internal links to designs
```

This may be more effective than trying to force Google to index every design page.

## What success looks like

The application succeeds if it can say something like:

```text
Indexed pages are much more likely to belong to albums with strong internal links and GA4 traffic.
Recommendation: strengthen album pages and link from each album to selected high-value designs.
```

or:

```text
There is no strong difference between indexed and non-indexed pages by downloads or Pinterest traffic.
Recommendation: run controlled content experiments before mass rewriting.
```

The goal is not to guess. The goal is to use your data to decide what to do next.
