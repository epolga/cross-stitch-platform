# Research Photo Consent — Data Handling Reference

## Purpose

Documents exactly what this feature collects, where it's stored, how consent
is gated, and how the stored photo links back to the design it became.
Written for two uses: Olga's own reference, and something to hand a
GDPR-competent lawyer/consultant before turning the feature on in production.

## Status (2026-08-10)

- **Built, not deployed.** All code below exists only in the local working
  copy — nothing has been committed or pushed. The production site
  (`cross-stitch-com-env-clone`) has none of this code running.
- **Off everywhere it could run.** Local `.env.local` has
  `RESEARCH_IMAGE_COLLECTION_ENABLED=false`. Production has no such variable
  set at all, which also resolves to off (see "Master switch" below).
- **Tested once, locally**, by Olga on her own real account (`olga.epstein@gmail.com`)
  with the flag temporarily forced on for that dev-server process only. One
  design ("Olga", patternId `643f1562-a73c-4c00-aa81-22bb9b2c68b6`) has a
  real linked research photo as a result — this was a deliberate test, not
  incidental collection.
- **Not yet resolved: whether/how this can legally go live.** See "Open
  questions before enabling in production" below. Do not set the production
  env var to `true` until that's settled.

## What is collected

The raw photo a visitor uploads to the "Import from Photo" converter —
exactly the bytes they submitted, unmodified, in its original format
(JPEG/PNG/WebP/GIF, same validation as the converter itself: max 5 MB). No
face detection, no metadata stripping/extraction, no other processing is
applied to the research copy — it's a straight copy of what the converter
already receives for its normal job.

**Not collected**, even when this feature is on: anything about visitors who
don't check the box. The photo itself was never persisted anywhere before
this feature (see the "no image ever stored" investigation earlier in
2026-08-10's session — `/api/convert/route.ts` used to hold the upload only
as an in-memory buffer for the duration of the request).

## Consent mechanism

- A checkbox in the "Import from Photo" dialog, **unchecked by default**
  (`web/src/app/components/ImportFromPhotoDialog.tsx:440-456`). Wording
  currently shown:
  > "Allow us to save a copy of this photo for research purposes, to help
  > improve the converter. Optional — the pattern still generates either
  > way. See our Privacy Policy."
- Links to `/privacy-policy` — **that page does not yet mention this
  feature at all.** Needs a real paragraph before this can go live (see
  open questions).
- The checkbox only renders if the feature is enabled server-side (see
  below) — a visitor on a build where the flag is off never sees it and
  is never asked.
- Consent is per-conversion-attempt, not a persistent account-level
  preference. Every time someone imports a new photo, they choose again.

## Master switch

Single source of truth: **`isResearchImageCollectionEnabled()`**, defined
in `web/src/lib/research-consent.ts:9-11`:

```ts
export function isResearchImageCollectionEnabled(): boolean {
  return process.env.RESEARCH_IMAGE_COLLECTION_ENABLED === 'true';
}
```

True in exactly one case: the server-only env var
`RESEARCH_IMAGE_COLLECTION_ENABLED` is set to the exact string `'true'`.
Not a `NEXT_PUBLIC_` variable, so flipping it in production needs an
Elastic Beanstalk environment-variable change + restart, not a code
deploy. Currently only true on Olga's local dev server (started manually
with that env var set for testing) — `false` in `.env.local`, unset (=
false) in production.

The flag is checked in **two independent places**, so a forged/replayed
client request can't collect anything while it's off server-side:

1. `web/src/app/api/config/research-collection/route.ts` — a GET endpoint
   the client asks to decide whether to render the checkbox at all.
2. `web/src/app/api/convert/route.ts` (`saveResearchCopy()`) — re-checked
   right before the S3 write, regardless of what the client claims.

### Where the consent field itself is checked

- `web/src/app/api/convert/route.ts:59` — reads the client's answer out of
  the submitted form: `const researchConsent = (formData.get('researchConsent') as string | null) === 'true';`
- `web/src/app/api/convert/route.ts:89` — passed into `saveResearchCopy(buffer, file.type, researchConsent)`.
- `web/src/app/api/convert/route.ts:32` — inside `saveResearchCopy()`, the
  actual gate: `if (!consentGiven || !isResearchImageCollectionEnabled()) return undefined;`
  Both conditions are independent — a client sending `researchConsent=true`
  with the master switch off still saves nothing.

## Where the photo is stored

- Bucket: `cross-stitch-designs` (an existing bucket already used for
  catalog photos/PDFs — no new bucket was provisioned).
- Key pattern: `research-uploads/<YYYY-MM-DD>/<uuid>.<ext>`
- Written in `web/src/app/api/convert/route.ts`, `saveResearchCopy()` —
  best-effort: a failed upload logs an error but never breaks the
  conversion response the visitor is waiting on.
- **No retention/expiry policy exists yet.** Objects stay indefinitely
  until someone manually deletes them (as was done today for two orphaned
  test uploads). This needs a decision before production use.
- **No deletion-on-request mechanism exists yet.** If a visitor later wants
  their research photo removed (GDPR right to erasure), there is currently
  no self-service or admin tool for that — would need to be built, or
  handled as a manual S3 delete by key.

## How the photo links to the design

The link lives on the **design's** record, not the photo's — the pattern
stores a pointer to its source photo, not the other way around.

- Field: **`researchImageKey`** on the `ConverterPatterns` DynamoDB table
  (one row per saved personal pattern). Value is the S3 key above.
- Written in `web/src/lib/pattern-storage.ts`:
  - `savePattern()` — sets it on first save, if a key was provided.
  - `updatePattern()` — **only sets, never clears** it on a re-save. A
    routine edit-resave that didn't import a new photo passes no key and
    the existing link (if any) is left untouched; importing a *new* photo
    into an already-saved pattern (Redo / Load New) passes a fresh key and
    overwrites the old link. (This update-path handling was added after a
    real gap was found: the first local test saved via an update to an
    already-open pattern, and the very first version of this feature only
    wired the link into the create path, so the link silently never got
    recorded. Fixed same session.)
  - `loadPattern()` — returns it as `researchImageKey` on the pattern
    object.
- Flows through the app as: `/api/convert` response
  (`ConvertedPattern.researchImageKey`, in `web/src/lib/pattern-converter.ts`)
  → held in React state in `ConvertClient.tsx` → sent along in the
  save/update request body → written to DynamoDB as above.
- Only recorded if the pattern is actually **saved** (logged-in user,
  explicit Save). An unsaved conversion attempt still uploads the research
  photo (if consented) but nothing links to it — same orphaned-photo
  situation as the two test uploads deleted today.

## Open questions before enabling in production

Carried over from the original discussion (2026-08-10) — not yet answered:

1. Is the in-form checkbox itself sufficient GDPR consent, or does it need
   to be a separate, more prominent step (not bundled with "Convert")?
2. What retention period is defensible — indefinite, or automatic
   deletion/anonymization after some period?
3. Special handling for photos of children (GDPR gives minors' data extra
   protection; the site has no age gating at all)?
4. The uploader consents, but the photo may show someone else — how is
   that handled?
5. Does a self-service or admin "delete my research photo" mechanism need
   to exist before launch, given the right to erasure?
6. Should the fact of consent itself be logged (timestamp, exact wording
   shown) as evidence for a future compliance check?
7. Is "for research purposes, to help improve the converter" a specific
   enough stated purpose under GDPR's purpose-limitation principle, or
   does the wording need to be narrower?
8. The Privacy Policy (`/privacy-policy`) needs a real paragraph covering
   this — what's collected, why, retention, how to request deletion —
   before the checkbox can honestly link to it.

## How to enable (once the above is resolved)

Add `RESEARCH_IMAGE_COLLECTION_ENABLED=true` to the
`cross-stitch-com-env-clone` Elastic Beanstalk environment configuration
and restart — no code deploy needed, since the flag is read at request
time, not build time.
