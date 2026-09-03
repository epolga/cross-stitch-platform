// Resolves a ConverterPatterns `thumbnail` field to a displayable <img> src.
// Backward-compatible read support for the S3 migration in
// docs/web/pattern-save-item-size-bug-2026-08.md ("Proposed implementation
// plan", step 0) — ships *before* any save starts producing the new format,
// so existing inline data-URI thumbnails keep working unchanged forever
// (or until an explicit backfill) while new saves can move to S3 keys under
// `photos/converter-patterns/<patternId>.png` (same CloudFront path pattern
// `/photos/**` already used for catalog design images — data-access.ts,
// semantic-search.ts — so no new CloudFront behavior or next.config.js
// remotePatterns entry is needed).
export function resolveThumbnailSrc(thumbnail?: string): string | undefined {
  if (!thumbnail) return undefined;
  if (thumbnail.startsWith('data:')) return thumbnail;
  return `https://d2o1uvvg91z7o4.cloudfront.net/${thumbnail}`;
}
