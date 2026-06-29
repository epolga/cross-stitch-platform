# Focus

## Current goal

SEO for `/photo-to-cross-stitch` — get target keywords into visible page content so Google can index and rank them.

## Target keywords

| Keyword | Status |
|---|---|
| photo to cross stitch pattern | ✅ title, H1, meta |
| turn photo into cross stitch | ✅ body paragraph |
| image to cross stitch | ✅ intro paragraph |
| cross stitch editor | ✅ H2 + intro paragraph |
| cross stitch pattern generator | ✅ intro paragraph |
| custom cross stitch pattern | ✅ intro paragraph + meta description |
| make your own cross stitch pattern | ✅ FAQ entry |
| cross stitch pattern from photo | ✅ FAQ entry |
| pet portrait cross stitch | ✅ Tips section |
| free cross stitch pattern maker | ⛔ excluded — paywall planned; adding "free" now would mislead users and require a damaging title change later |

## Active work

Nothing in flight.

## Plan

### 1. Add missing keywords to visible content (`page.tsx`)

- **"image to cross stitch"** — add to the intro paragraph or a new short sentence:  
  e.g. "Turn any photo or image into a cross-stitch pattern…"
- **"cross stitch editor"** — add an H2 like "Built-in cross-stitch editor" above the feature highlights, or rename the section header.
- **Update meta `keywords`** tag to include the four target phrases (minor, Google ignores it, but still tidy).
- **Update `DESCRIPTION`** constant to include "image to cross stitch".

### 2. Verify page is in sitemap.xml

Check `web/src/app/sitemap.xml/route.ts` (or equivalent) — confirm `/photo-to-cross-stitch` is included.

### 3. Optional — additional SEO improvements

- **H2s with keywords**: current H2s ("Frequently Asked Questions", "Tips for the best result", etc.) don't use target keywords. Adding one keyword-rich H2 would help (e.g. "Free cross-stitch editor — edit before you download").
- **Internal links**: homepage and nav link already done. Consider a CTA link from the main design gallery pages pointing to the converter.
- **Internal links**: consider a CTA link from design gallery pages pointing to the converter.

## Done when

- [x] "image to cross stitch" appears in visible page text — 2026-06-29
- [x] "cross stitch editor" appears as H2 and in intro — 2026-06-29
- [x] "cross stitch pattern generator", "custom cross stitch pattern" in intro — 2026-06-29
- [x] "make your own cross stitch pattern", "cross stitch pattern from photo" in FAQ — 2026-06-29
- [x] "pet portrait cross stitch" in Tips section — 2026-06-29
- [x] `/photo-to-cross-stitch` confirmed in sitemap.xml (line 55, priority 0.8) — 2026-06-29
- [ ] Deployed and verified in browser
