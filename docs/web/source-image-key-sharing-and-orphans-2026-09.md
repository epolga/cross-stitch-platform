# Source-image key sharing, S3 orphans, and an ownerless-pattern auth gap — September 2026

**Status: all four tracks (A, B, C, D) plus the `newPattern()` fix done
2026-09-03; only the ownerless-pattern auth gap remains, deferred
deliberately.** Track D (the structural fix — defer S3 upload to Save
time, closing the leak at its actual source) is the important one: it
means new orphans stop accumulating going forward, not just that the
existing backlog got cleaned once. Found 2026-09-03 while
investigating the pattern-save DynamoDB item-size bug (Open item #25,
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

**Plan, updated 2026-09-03:**
- **Track A — DONE 2026-09-03, unconditional (no reference check).**
  `deletePattern()` (`pattern-storage.ts`) now deletes
  `thumbnail`/`sourceImageKey`/`researchImageKey`/`sourceImageMaskKey`
  from S3 unconditionally alongside the DDB row, best-effort (one key's
  S3 failure doesn't stop the others or block the pattern delete). A
  reference-counted check (Scan `ConverterPatterns` for any other row
  sharing the key before deleting) was the original plan but was decided
  against after checking the real data: 0 of 44 currently-referenced
  `sourceImageKey`/`researchImageKey` values collide across any of the
  127 real patterns — the sharing mechanism is real (see Finding 1's two
  scenarios) but has never actually happened, and a false-positive delete
  only degrades "Redo from Photo" on the other pattern (re-uploadable),
  not a data loss. Not worth a Scan on every delete for a collision that
  doesn't occur in practice. Covered by tests in `pattern-storage.test.ts`
  (deletes all four key types, no `ScanCommand` fired, one key's failure
  doesn't stop the rest).
- **Track B — DONE 2026-09-03.** Originally planned as a blind S3
  lifecycle rule by object age — corrected before implementing (Olga
  caught it): these keys are content-addressed and never rewritten, so a
  genuinely old-but-still-referenced object (a pattern saved months ago,
  untouched since) has the same `LastModified` as real garbage. Age alone
  can't tell them apart — a lifecycle rule would eventually delete images
  live patterns still depend on. Implemented instead as a real
  cross-reference: new `web/scripts/cleanup-orphaned-source-images.ts`
  (kept, not a one-off — unlike the thumbnail backfill, new orphans
  accumulate continuously from ordinary unsaved converter use, so this
  stays a reusable maintenance script) fetches the actual set of
  currently-referenced keys from `ConverterPatterns`, lists all S3
  objects in both prefixes, and deletes whatever isn't referenced *and*
  is older than a grace period (default 48h, `--grace-hours` to
  override) — the grace period protects objects from a session that
  hasn't hit Save yet. Dry run by default, `--confirm` to apply, same
  convention as the other scripts. Ran for real: **697/697 deleted, 0
  failures**, ~457 MiB backlog cleared. Re-scan afterward: 0 orphans past
  the grace period, 138 objects remain (44 referenced + 94 within the
  grace window). Verified a real referenced key from 2026-08-14 (well
  past the grace period, correctly kept because a live pattern still
  references it) survived intact in S3.
- **Track C — migrate `thumbnail` (Open item #25) to S3 — DONE
  2026-09-03**, full write-up in
  `docs/web/pattern-save-item-size-bug-2026-08.md`. Landed after Track A
  as planned, so it went straight under the same delete-time cleanup.
  Confirmed genuinely simpler than `sourceImageKey`/`researchImageKey` as
  expected — not content-addressed, so no sharing risk ever existed for
  it regardless of the Track A reference-check decision above.

### Structural fix — stop the leak at the source (Track D, DONE 2026-09-03)

Tracks A-C above clean up *after the fact* (on delete, or the existing
backlog). Olga asked the obvious follow-up: what actually guarantees new
orphans stop appearing? Answer at the time: nothing — Track A only
prevents leakage from pattern *deletion*, which was never the main source.
The real source is `/api/convert` uploading a copy on **every conversion
attempt**, saved or not — normal, expected behavior (most visitors try
before they save), so it was guaranteed to keep generating new orphans
indefinitely.

Investigated whether the S3 upload could move from convert-time to
Save-time instead of just being cleaned up after. Confirmed in code
(`ConvertClient.tsx`'s `openImportDialog()` comment): the original photo
file lives in the browser's memory for the whole editing session
(`ImportFromPhotoDialog`'s `selectedFile` ref) — the S3 copy of
`sourceImageKey` is only ever actually read back through
`source-image/route.ts` for **"Redo from Photo" after a page reload/reopen
of an already-*saved* pattern** (`sourceImageKey && savedPatternId` both
required). An unsaved conversion never needs the S3 copy at all, at any
point. `researchImageKey` is a different case in principle — its intent is
to capture every attempt for research, saved or not — but research
collection is currently disabled entirely (GDPR review pending), so
deferring it alongside `sourceImageKey` has zero live effect either way;
flagged as worth revisiting if research collection is ever re-enabled.

**Implemented:** moved the actual upload out of `api/convert/route.ts`
into a new `api/converter/upload-source-photo/route.ts`, called only from
`ConvertClient.tsx`'s `handleSavePattern()` — i.e., only when the owner
actually clicks Save. `ImportFromPhotoDialog` hands the File + consent
flags up via a new `onFileReady` callback (parallel to `onImport`) instead
of uploading them itself; `ConvertClient` holds them in `pendingSourceFile`
until Save, then uploads and threads the resulting keys into the same save
request. Found and fixed a real regression risk while implementing:
`handleImport()` used to set `sourceImageKey`/`researchImageKey` straight
from the convert response — since that response no longer carries them,
doing so would have wiped a *previously-saved* pattern's still-valid key
back to `undefined` on every "Redo from Photo"; removed instead, since the
Save flow is now the sole place these fields get updated.

Verified live: `POST /api/convert` response no longer contains
`sourceImageKey`/`researchImageKey` (confirmed via curl); converting the
sample photo without saving left `pattern-source-images/`'s object count
completely unchanged (139 → 139); the new `upload-source-photo` endpoint,
called directly, uploads correctly and returns a valid key (confirmed via
`head-object`). Full suite: 106 tests passing, `tsc --noEmit` clean.

With this, an abandoned conversion — the dominant real-world case per
Finding 1 — never touches S3 at all. Tracks A-C remain necessary as a
backstop (deletions, the pre-existing backlog, and `thumbnail`), but the
primary leak is now closed at the source rather than merely cleaned up
after.

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
