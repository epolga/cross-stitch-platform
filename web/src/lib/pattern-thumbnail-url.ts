// Resolves a ConverterPatterns `thumbnail` field (an S3 key, e.g.
// `photos/converter-patterns/<patternId>.jpg`) to a displayable <img> src.
// Same CloudFront path pattern `/photos/**` already used for catalog
// design images (data-access.ts, semantic-search.ts), so no new CloudFront
// behavior or next.config.js remotePatterns entry was needed.
//
// This originally also had a `data:` passthrough branch (step 0 of
// docs/web/pattern-save-item-size-bug-2026-08.md's implementation plan)
// for backward compatibility with the old inline-base64 format, shipped
// *before* the write path (step 1) so a pattern saved in the new format
// was never unreadable. Removed 2026-09-03 (step 6) once the backfill
// (step 4) confirmed 0 rows left in the old format, and the write path
// (storeThumbnail(), pattern-storage.ts) can no longer produce one going
// forward — the transition period is over.
export function resolveThumbnailSrc(thumbnail?: string): string | undefined {
  if (!thumbnail) return undefined;
  return `https://d2o1uvvg91z7o4.cloudfront.net/${thumbnail}`;
}
