# Image domain: move design images from the CloudFront domain to `img.cross-stitch.com`

Status: **planned, deliberately not started** (decided with Olga 2026-11-15).
Decision point: **~2026-12-01** (moved 2026-11-16 from 11-22..25), based on
whether Google thumbnails for the homepage came back (see "Why wait").

**Why moved:** Google's November 2026 core update started 2026-11-10 and may
run until ~11-24 (Google Search Status Dashboard); Google advises waiting a
full week after it ends before judging impact in Search Console. The homepage's
sharpest 3-month drop (impressions 12-13 Nov: ~1800/day vs ~2900) follows
right after the start. Correlation, not proven cause. Changing the image host
mid-rollout would add another variable.

## Why this came up

From ~2026-11-12 the homepage lost Google impressions and the SERP result for
`cross stitch patterns` (gl=us) lost its thumbnail and its own title. Olga's
hypothesis: thumbnails are missing because images are served from the
CloudFront domain `d2o1uvvg91z7o4.cloudfront.net`, not from the site's domain.

My assessment (not proven): a third-party CDN host is normal for Google and
thumbnails existed before with the same host, so the domain alone is unlikely to
be the cause. A more specific defect was found on 2026-11-14: `/robots.txt` on
the image host returned **502** (dead default origin). Google reads the image
host's robots.txt before fetching images; an unreachable robots.txt can stop
images being shown. Fixed 2026-11-14 (CloudFront behavior `/robots.txt` ->
S3 `cross-stitch-designs/robots.txt`). Other fixes the same day: Next.js
`htmlLimitedBots` (title/canonical now in `<head>` for Googlebot).

## Why wait

Google treats a new image URL as a new image, so moving the host means
re-crawling and re-indexing every design image, and the old image URLs drop out
of the index meanwhile. If the robots.txt fix is the real cause, the move is
unnecessary and only costs re-indexing; if it isn't, the move is worth doing.
Changing both at once would also hide which one helped.

## Facts verified 2026-11-15

- `ImageUrl` is computed in `web/src/lib/data-access.ts:171` from `AlbumID` +
  `DesignID` (`.../photos/{album}/{design}/4.jpg`); `item.ImageUrl?.S` is read
  first, but **0 of 5294** designs in `CrossStitchItems` have a stored
  `ImageUrl`, so changing the template changes every design. No DB migration.
- The host is hard-coded in ~12 places in `web/src` (data-access.ts x2,
  designs/[designId]/page.tsx, page.tsx, album-metadata.ts, blog-posts.ts,
  DownloadPdfLink.tsx, RegisterForm.tsx, pattern-thumbnail-url.ts,
  pattern-pdf.ts x2, semantic-search.ts), also `next.config.js`
  `images.remotePatterns`, plus scripts in `automation/pinterest-agent/scripts/`
  and `automation/autopinner` (`Config.cs`) and docs. Move it into one constant
  first.
- `CreateImageUrl()` in `url-helper.ts` is unused dead code.
- CloudFront `E1CZPZ7AHZU26G` has **no aliases**; it still carries the old ACM
  cert for `cross-stitch-pattern.net`. Existing `cross-stitch.com` certs cover
  only the apex and `www`, not `img.`.
- DNS is Route 53: zone `cross-stitch.com` (`Z076595833WU5X3CFUC3U`).
- Images and PDFs stay where they are (S3 `cross-stitch-designs`); only the
  public host changes.

## Plan

### Part A — preparation (no effect on visitors or Google; needs Olga's "да",
production AWS)

1. Request ACM cert (us-east-1) for `img.cross-stitch.com`, DNS validation.
2. Add the validation CNAME to the Route 53 zone; wait for `ISSUED`.
3. Back up the distribution config (`get-distribution-config`), add alias
   `img.cross-stitch.com`, replace the `cross-stitch-pattern.net` cert with the
   new one. (Same procedure as the 2026-11-14 `/robots.txt` change.)
4. Route 53: `img.cross-stitch.com` A (alias) -> the distribution.
5. Verify `https://img.cross-stitch.com/photos/<album>/<design>/4.jpg` and
   `/robots.txt` return 200, and the old CloudFront URL still works.

### Part B — switch (only after the decision point says thumbnails did NOT return)

1. Replace hard-coded host with one constant (`IMAGE_BASE_URL`), update
   `next.config.js` `remotePatterns`, scripts, autopinner config, docs.
2. Deploy via `/deploy-web`. Keep the old host serving the same files
   (do not remove it) so existing links, Pinterest pins and emails keep working.
3. Consider a 301 from old host paths to `img.` only if re-indexing is slow.
4. Watch GSC (Pages / Images) and homepage impressions for 2 weeks.

## Decision rule (~2026-12-01, after the core update has finished + a week)

- Thumbnails back and impressions recovering toward ~4500-5000/day -> do **not**
  switch; keep Part A prepared or drop it.
- No thumbnails, impressions still ~3500/day -> do Part B.
