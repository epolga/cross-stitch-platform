# Claude Code Task: Build SEO Diagnosis Agent for cross-stitch.com

## Mission

Build a read-only SEO diagnosis application for `cross-stitch.com`.

The goal is to understand why Google Search Console shows a large drop in indexed pages around late April / early May 2026 and why many design pages are currently not indexed.

The application must connect:

1. DynamoDB
2. GA4
3. Pinterest API
4. Google Search Console API

It must produce clear Markdown and JSON reports with evidence-based recommendations.

## Very important constraints

This first version is diagnostic only.

Do not:

- change production data
- update DynamoDB
- update website content
- submit thousands of URLs for indexing
- modify sitemap files
- modify canonical tags
- upload new Pinterest pins
- change ads
- generate mass AI descriptions
- run destructive operations

The output should be local report files only.

## Context

The website moved from:

```text
cross-stitch-pattern.net
```

to:

```text
cross-stitch.com
```

around January 1, 2026.

Around mid-April 2026, Google sent a message that the old `cross-stitch-pattern.net` property could not be verified.

Around late April / early May 2026, Google Search Console showed a sharp drop in indexed pages.

Known GSC status categories include:

- `Crawled - currently not indexed`
- `Alternate page with proper canonical tag`

Canonical tags appear technically correct. The issue is probably not a simple canonical bug.

The working hypothesis is one or more of:

1. Google update / quality reevaluation.
2. Domain migration signal transfer.
3. Large catalog of similar design pages.
4. Google prefers album pages over individual design pages.
5. Internal linking / demand / engagement differences between indexed and non-indexed pages.

## Add Google Search Console API integration

### Required OAuth scope

Use read-only scope first:

```text
https://www.googleapis.com/auth/webmasters.readonly
```

If the existing Google OAuth system is used for GA4, extend it carefully and require re-consent.

### Required API capabilities

Implement these functions:

```text
listSearchConsoleSites()
getSearchAnalyticsByPage(siteUrl, startDate, endDate)
getSearchAnalyticsByQuery(siteUrl, startDate, endDate)
inspectUrl(siteUrl, inspectionUrl)
listSitemaps(siteUrl)
getSitemap(siteUrl, sitemapUrl)
```

### Important GSC notes

The URL Inspection API endpoint is:

```text
POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect
```

It requires the inspected URL and the Search Console site URL.

It returns URL-level indexing information known to Google Search Console, not a fresh live test.

Respect all Google Search Console API quotas. Implement throttling and retries.

## Existing data sources

Reuse existing project capabilities where possible.

### DynamoDB

Query design metadata.

Expected useful fields:

```text
DesignID
AlbumID
Caption
Description
Width
Height
NColors
NDownloaded
ImageUrl
PdfUrl
PinterestPinId
PinterestPinUrl
NPage
NGlobalPage
```

If exact field names differ, inspect the existing code and adapt.

### GA4

Use existing GA4 access in test mode.

Collect page-level metrics for `cross-stitch.com`.

Useful metrics:

```text
sessions
activeUsers
screenPageViews
engagementRate
averageSessionDuration or averageEngagementTime
eventCount
```

Useful dimensions:

```text
pagePath
pageLocation
sessionSource
sessionMedium
date
```

### Pinterest

Use existing Pinterest access.

Collect available pin-level metrics:

```text
PinterestPinId
pin creation date
impressions
saves
outbound clicks
CTR
linked URL
```

If some metrics are unavailable, note this in the report.

## URL normalization

Create one shared URL normalization module.

It must handle:

- uppercase/lowercase path comparison
- trailing slash differences
- `http` vs `https`
- `www` vs non-www
- UTM parameters
- `fbclid`, `gclid`, and similar tracking parameters
- legacy domain redirects from `cross-stitch-pattern.net` to `cross-stitch.com`

Canonical comparison must be careful because URL casing may matter to Google even if the application route accepts both.

## Design URL mapping

Implement reliable mapping from URL to design record.

For URLs like:

```text
https://cross-stitch.com/Moonlight-8-231-Free-Design.aspx
```

identify the corresponding design record.

Do not assume URL numbers are always `DesignID`. Confirm by existing route logic or DynamoDB fields.

If the URL cannot be matched, record it in an `unmatchedUrls` section.

## Main analysis

The main report must compare indexed vs non-indexed pages.

### Page groups

At minimum, classify URLs into:

```text
design_indexed
design_crawled_not_indexed
design_alternate_canonical
album_indexed
album_not_indexed
other_indexed
other_not_indexed
unmatched
```

### For each group compute

```text
count
average downloads
median downloads
average GA4 sessions
median GA4 sessions
average Pinterest impressions
average Pinterest outbound clicks
PinterestPinId presence rate
average design age if available
top AlbumIDs
top captions/themes if available
average search impressions
average search clicks
average position
```

### Compare indexed vs not indexed

Produce direct comparisons:

```text
Indexed designs vs crawled-not-indexed designs
Indexed albums vs non-indexed albums
Design pages vs album pages
Designs with Pinterest pins vs without Pinterest pins
High-download designs vs low-download designs
High-GA4-traffic designs vs low-GA4-traffic designs
```

## Sampling strategy

Because URL Inspection API has quotas, do not inspect all URLs at once.

Implement staged sampling:

### Stage 1

Inspect:

```text
50 indexed-looking design URLs
50 crawled-not-indexed examples from known lists if available
50 album URLs
50 random design URLs
```

If Search Console does not provide all status buckets directly through API, allow importing CSV exports from GSC manually.

### Stage 2

Expand to 500 URLs only after Stage 1 works.

### Stage 3

Optional full-catalog scan only with quota-aware batching and explicit user approval.

## Input options

Support both:

1. API-driven mode.
2. CSV-assisted mode.

CSV-assisted mode should accept exports from Google Search Console, such as:

```text
reports/input/gsc-pages-crawled-not-indexed.csv
reports/input/gsc-pages-alternate-canonical.csv
reports/input/gsc-indexed-pages.csv
```

This is important because some GSC UI report data may be easier to export manually than fetch directly.

## Output files

Create:

```text
reports/seo-indexing-diagnosis-YYYY-MM-DD.md
reports/seo-indexing-diagnosis-YYYY-MM-DD.json
reports/seo-indexing-diagnosis-YYYY-MM-DD.csv
```

The Markdown report should be readable by a non-programmer.

The JSON report should contain all raw grouped statistics.

The CSV should contain one row per analyzed URL.

## Markdown report structure

Use this structure:

```text
# SEO Indexing Diagnosis Report

## Executive Summary

## What Changed

## Data Sources Used

## Important Limitations

## Current Indexing Picture

## Indexed vs Non-Indexed Design Pages

## Album Pages vs Design Pages

## Pinterest Signal Analysis

## GA4 Traffic Analysis

## Download Count Analysis

## Canonical and URL Variant Analysis

## Likely Causes

## Recommended Actions

## 50-Page Experiment Plan

## What Not To Do Yet

## Data Gaps

## Next Run Instructions
```

## Recommendation rules

The agent must not make unsupported claims.

Use language like:

```text
The data suggests...
The strongest correlation is...
This does not prove causation...
This needs a controlled experiment...
```

Do not say:

```text
Google deindexed pages because...
```

unless the data truly proves it.

## Required recommendations to consider

The report should evaluate these possible actions:

1. Strengthen album pages.
2. Advertise selected album pages on Pinterest.
3. Add internal links from albums to selected designs.
4. Add `More from this album` sections to design pages.
5. Add image-specific content to a small test group of design pages.
6. Improve metadata consistency.
7. Normalize duplicate URL variants.
8. Monitor old-domain to new-domain redirect behavior.
9. Compare old-domain URLs still known to Google.
10. Avoid mass AI-generated descriptions until a controlled test proves value.

## 50-page experiment plan

The agent should select candidate pages for a controlled experiment:

```text
25 high-potential non-indexed design pages
25 similar control pages
```

Selection criteria:

- currently not indexed or crawled-not-indexed
- belongs to an important album
- has some existing demand signal if possible
- has clear image and usable metadata
- not already heavily improved

For the 25 test pages, recommend changes:

- unique image-specific 100–200 word description
- difficulty level
- estimated stitching time
- recommended fabric
- related designs
- links to album page
- links from album page to the design

Do not implement the changes automatically.

## Implementation notes

Prefer TypeScript if the existing tool is Node/TypeScript.

Suggested structure:

```text
src/seo-diagnosis/
  gscClient.ts
  ga4Client.ts
  pinterestClient.ts
  dynamoDesignRepository.ts
  urlNormalizer.ts
  designUrlMatcher.ts
  analysisEngine.ts
  reportWriter.ts
  runSeoDiagnosis.ts
```

Suggested command:

```text
npm run seo:diagnose
```

or:

```text
npx tsx src/seo-diagnosis/runSeoDiagnosis.ts
```

## Environment variables

Use existing secrets pattern.

Add only if needed:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
GSC_SITE_URL=https://cross-stitch.com/
GSC_OLD_SITE_URL=https://cross-stitch-pattern.net/
GA4_PROPERTY_ID
AWS_REGION
```

Do not commit secrets.

## Acceptance criteria

The task is complete when:

1. GSC OAuth works with `webmasters.readonly`.
2. The app can list Search Console properties.
3. The app can fetch Search Analytics page data.
4. The app can inspect at least one URL.
5. The app can query DynamoDB design metadata.
6. The app can join GSC URL data to design records.
7. The app can include GA4 page metrics.
8. The app can include Pinterest metrics where available.
9. The app produces Markdown, JSON, and CSV reports.
10. The report gives ranked recommendations and a 50-page experiment plan.

## First test URL

Use this URL as a known test case:

```text
https://cross-stitch.com/Moonlight-8-231-Free-Design.aspx
```

Expected behavior:

- Fetch GSC inspection data.
- Fetch matching DynamoDB design data.
- Show canonical URL.
- Show indexing status.
- Show available GA4 and Pinterest data.
- Include it in the URL-level CSV output.

## Final instruction

Build the diagnosis system first.

Do not attempt to solve the SEO problem blindly.

The purpose of this project is to replace guessing with evidence.
