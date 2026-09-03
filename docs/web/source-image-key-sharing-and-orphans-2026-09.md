# Source-image key sharing, S3 orphans, and an ownerless-pattern auth gap — September 2026

**Status: mixed — one fix shipped (uncommitted), one cleanup planned but not
started, one gap documented and deliberately deferred.** Found 2026-09-03
while investigating the pattern-save DynamoDB item-size bug (Open item #25,
`docs/web/pattern-save-item-size-bug-2026-08.md`) and whether `thumbnail`
could move to S3 the same way `sourceImageKey`/`researchImageKey` already
do. Full pointer in `Focus.md` Open item #32.

## Background: content-addressed source-image storage

`saveSourceCopy()`/`saveResearchCopy()` (`web/src/app/api/convert/route.ts`)
key S3 objects by `sha256(file bytes)` under `pattern-source-images/` and
`research-uploads/` in the `cross-stitch-designs` bucket — re-uploading
identical bytes reuses the existing key instead of creating a duplicate
(`objectExists()` check, added 2026-08-13 specifically to stop "Redo"
leaving fresh orphans on every reconvert). Consequence: the **same S3 key
can legitimately be referenced by multiple `ConverterPatterns` rows**,
possibly owned by different users, whenever the identical image bytes get
saved as a pattern more than once. Confirmed **not itself a privacy leak**:
producing the same sha256 requires already possessing the same bytes, so
nobody gains access to image data they didn't already have.

## Finding 1: ~506 MiB of orphaned S3 objects (94.7% of the two prefixes)

Read-only scan 2026-09-03 (no deletions performed):

| Prefix | Objects | Size | Referenced by a live pattern |
|---|---|---|---|
| `pattern-source-images/` | 804 | ~528 MiB | 42 |
| `research-uploads/` | 23 | ~5.6 MiB | 2 |
| **Total** | **827** | **~535 MiB** | **44** |

**783 objects (~506 MiB, 94.7%) are orphan candidates** — not referenced by
any of the 127 rows currently in `ConverterPatterns` (full, unpaginated
`Scan`, `ProjectionExpression` on the three key fields, `ScannedCount`
matched `Count`, no `LastEvaluatedKey`). Zero broken links the other
direction (all 44 referenced keys exist in S3).

**Root cause is mostly not deletions — it's that upload happens before
save.** `/api/convert` uploads to S3 on every conversion attempt,
regardless of whether the resulting pattern is ever saved to
`ConverterPatterns` (a separate, later `POST`). Newest orphans found were
from *the same day* (2026-09-03), consistent with ordinary "tried the
converter, didn't save" behavior, not just deleted patterns. This means
adding S3 cleanup to `deletePattern()` alone would only address a small
slice of the total — most of the backlog was never linked to a saved
pattern in the first place.

**Safety net already in place, relevant to any cleanup plan:** the bucket
has **versioning enabled** and an existing lifecycle rule ("Life
expectancy": `NoncurrentVersionExpiration` after 90 days, keeping the 3
newest noncurrent versions) — a `DeleteObject` here creates a delete
marker, not an immediate hard delete, so mistakes are recoverable for 90
days without any new configuration.

**Proposed plan, not started:**
- **Track A** — add reference-counted S3 cleanup to `deletePattern()`
  (query `ConverterPatterns` for any other row still using the same key
  before deleting it from S3 — required because of content-addressing,
  see above). Stops new leakage from deletions specifically.
- **Track B** — clear the existing ~506 MiB backlog via an S3 lifecycle
  rule expiring objects in these two prefixes past some age (e.g. 30
  days), relying on the existing versioning safety net rather than new
  app code. Simpler and safer than a one-off delete script.
- **Track C** — migrate `thumbnail` (Open item #25) to S3 the same way,
  *after* Track A ships, so it lands directly under the same
  reference-aware cleanup instead of creating a third leak source. Unlike
  `sourceImageKey`/`researchImageKey`, `thumbnail` is **not**
  content-addressed (freshly rendered per save from the live grid/palette
  state), so it has no cross-pattern sharing risk — a straight per-pattern
  key works.

## Finding 2 (fixed, uncommitted): `newPattern()` didn't reset the image-key state

`newPattern()` (`ConvertClient.tsx`, written 2026-06-27, `abc6def`) resets
`savedPatternId` and most editor state on "New Pattern," but
`sourceImageKey`/`researchImageKey`/`sourceImageMaskKey` (added
2026-08-10/11, ~6 weeks later) were never added to that reset list —
ordinary oversight, not a deliberate choice; nothing in the surrounding
code or comments suggested otherwise. Effect: clicking "New Pattern," then
importing the same photo again and saving, created a second pattern
carrying over the previous session's source-image key. **Fixed 2026-09-03**
— added `setResearchImageKey(undefined)`, `setSourceImageKey(undefined)`,
`setSourceImageMaskKey(undefined)` next to the existing
`setSavedPatternId(null)`. Not yet committed.

## Finding 3 (found, deliberately deferred — not fixed): ownerless-pattern auth gap

Every route that serves or mutates a pattern by ID uses the same
conditional-ownership pattern:

```
if (pattern.ownerID) {
  // check session.userId === ownerID, else 403
}
// no ownerID on the row at all -> no check, request proceeds
```

Present identically in `GET`/`PUT`/`DELETE`
(`web/src/app/api/converter/patterns/[id]/route.ts`) and in
`web/src/app/api/converter/patterns/[id]/source-image/route.ts` (the route
that streams back the owner's original uploaded photo). **If a pattern row
has no `ownerID`, anyone who knows or obtains its `patternId` — no login
required — can read (and, via PUT, overwrite) it, including fetching the
original source photo.**

**Verified dormant, not currently exploitable, 2026-09-03:**
- 14 of 127 `ConverterPatterns` rows have no `ownerID`, all created
  2026-06-26/27 (the feature's launch window) — before `sourceImageKey`
  existed at all (added 2026-08-10/11). None of the 14 has a source image
  to expose.
- `POST /api/converter/patterns` (the only pattern-creation path) always
  requires a session and always passes `session.userId` as `ownerID`
  (`savePattern()`'s `ownerID` parameter is required, not optional, and is
  written unconditionally — `pattern-storage.ts:104,128`). So no *new*
  ownerless row can be created through normal app use going forward.

**Not fixed — deliberately deferred per Olga's ask ("запиши на будущее"),
2026-09-03.** Proposed fix when picked up: replace the conditional check
with an unconditional one (require `session.userId === pattern.ownerID`
regardless of whether `ownerID` is present) in all four routes above —
small, low-risk change, but explicitly not done yet since the gap is
provably inert against current data.
