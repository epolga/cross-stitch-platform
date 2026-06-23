# S1 + S2 + S3 Implementation Plan

Source milestone doc: `Cross-Stitch.com — Site Technology Milestones.md`

---

## S1 — Image SEO & Modern Delivery

**Current state**: `images.unoptimized: true` in `next.config.js`; alt text is a hardcoded template
(`${Caption} free cross-stitch pattern`), not a stored field; Schema.org keywords are hardcoded
`"cross stitch, free pattern, design"`; no image sitemap; no WebP/AVIF.

### Steps

**1. Alt text field**
- Add `AltText?: string` to `web/src/app/types/design.ts`
- Batch script `scripts/generate-alt-text.ts` — for each design, send Caption + Description +
  SeoDescription to Claude Haiku → generate a specific, keyword-rich alt text sentence
  (e.g. *"beginner cross-stitch pattern of a sitting orange tabby cat, 45×50 stitches, 8 colors"*)
- Store as `AltText` in DDB; 5,500 designs at ~100 tokens each ≈ $0.07 with Haiku 4.5
- Wire into both image usages:
  - `designs/[designId]/page.tsx:321` — main image
  - `components/DesignList.tsx:128` — card thumbnails

**2. Enable Next.js image optimization**
- Remove `images.unoptimized: true` from `next.config.js`
- Install `sharp` (`npm install sharp`) — required by Next.js for server-side resize/WebP conversion
- Next.js then serves `/photos/**` images as WebP/AVIF automatically via `/_next/image`
- Add `priority` prop to the main design image (it is the LCP element; currently missing)
- The existing `sizes="(max-width: 600px) 100vw, 600px"` on list cards is already correct

**3. Dynamic structured data**
- In `generateMetadata()` at `designs/[designId]/page.tsx:138–154`, replace the hardcoded
  `keywords` string with derived terms: caption words, album name, difficulty bucket, size bucket,
  color count
- Extend `keywords` and `description` in the Schema.org `CreativeWork` JSON-LD block to use
  `SeoDescription`

**4. Image sitemap**
- Add `web/src/app/sitemap-images.xml/route.ts` returning a standard Google image sitemap
- For each design: `<image:loc>`, `<image:title>` (Caption), `<image:caption>` (AltText)
- Reference it from `robots.txt`

---

## S2 — Structured Filters & Faceted Browsing

**Current state**: `FilterOptions` supports only `searchText`, `widthFrom/To`, `heightFrom/To`,
`ncolorsFrom/To`. Albums are the sole grouping mechanism. `fetchFilteredDesigns()` runs in-memory
on the full design cache.

### Taxonomy strategy — no AI needed for the first layer

Albums are already named "Cats", "Dogs", "Christmas", "Flowers", etc. Map album names to a subject
taxonomy in a static file — reliable, free, instant.

**Derivable from existing fields** (computed at cache-load time, no DDB changes):

| Facet | Derivation |
|---|---|
| `Subject` | AlbumCaption → static map (e.g. "Cats" → "animals", "Christmas" → "seasonal-christmas") |
| `Orientation` | Width > Height → landscape; Height > Width → portrait; within 10% → square |
| `SizeCategory` | max(Width, Height): ≤50 → small, 51–100 → medium, >100 → large |
| `ColorBucket` | NColors: ≤5 → few, 6–15 → medium, >15 → many |
| `IsBeginnerFriendly` | NColors ≤ 5 AND Width ≤ 60 AND Height ≤ 60 |

### Steps

**1. Subject taxonomy map**
- New file `web/src/data/album-taxonomy.ts` — maps each album name to a normalized subject tag
- Read all album names once and build this map (likely 20–40 distinct albums)

**2. Computed fields at cache load**
- Extend the design-loading logic in `data-access.ts` to compute and attach `subject`,
  `orientation`, `sizeCategory`, `colorBucket`, `isBeginnerFriendly` on each Design object
  in memory
- No DDB writes needed; these fields are always recomputed from the source data

**3. Extend FilterOptions + fetchFilteredDesigns**
- Add to `FilterOptions` interface: `subject?`, `orientation?`, `sizeCategory?`, `difficulty?`
- Extend `fetchFilteredDesigns()` with the corresponding filter logic (all still in-memory)

**4. Filter UI**
- Extend `SearchForm.tsx` with new controls:
  - Subject dropdown (populated from available subjects in the cache)
  - Size: Small / Medium / Large radio
  - Orientation: Portrait / Landscape / Square radio
  - Difficulty: Beginner-friendly toggle
- Keep existing width/height/color range sliders; wrap them in an "Advanced" collapsible section
- Filter state maps to URL query params (same pattern as existing filters)

**5. SEO — curated static pages**
- Create high-value static pages: `/beginner-cross-stitch-patterns`,
  `/christmas-cross-stitch-patterns`, `/cat-cross-stitch-patterns`,
  `/geometric-cross-stitch-patterns`
- Each renders with pre-applied filters and a unique `<h1>` + meta description
- All other filter combinations: client-side only with
  `<meta name="robots" content="noindex">`

---

## S3 — Visual Similarity Search

**Current state**: no embedding infrastructure; no Bedrock SDK; CloudFront image URLs are
predictable (`/photos/{AlbumID}/{DesignID}/4.jpg`); ~5,500 designs.

### Embedding strategy

Use **separate image and text embeddings** with explicit weighting at scoring time:

```
FinalScore = cosine(img_query, img_candidate) × 0.75
           + cosine(txt_query, txt_candidate) × 0.25
```

This gives full control over the image/text balance and makes it easy to adjust the ratio after
observing real results. Titan's built-in image+text averaging is not used because it gives equal
weight to both inputs, which is wrong for a visual product where image similarity should dominate.

**Model**: Amazon Bedrock **Titan Multimodal Embeddings v1** (`amazon.titan-embed-image-v1`)
- Image input (base64) → 1024-dim float vector
- Text input only → 1024-dim float vector in the **same** semantic space
- Cosine similarity between image and text vectors is directly comparable
- Cost: ~$0.00006/image, ~$0.00002/1K text tokens → **~$0.35 total** for the full initial batch

### Storage — no vector DB needed

5,500 designs × 2 vectors × 1024 floats × 4 bytes = ~45 MB total raw vectors.
Stored in S3 as two JSON files: `image-vectors.json` and `text-vectors.json`.

**Precomputed similarity map** (the only thing needed at runtime):
- Script computes top-20 nearest for every design using the formula above
- Writes `similar-designs.json`: `{ "5341": [1234, 5678, ...18 more], ... }`
- Size: ~440 KB — trivially small, loaded once at API startup

### Steps

**1. Install Bedrock SDK**
- `npm install @aws-sdk/client-bedrock-runtime` in `web/` and in `automation/`

**2. Batch embedding script** — `scripts/generate-embeddings.ts`
- For each design:
  - Fetch image from CloudFront → base64
  - Call Titan with `inputImage` → `imageVec`
  - Build text string: `${Caption}. ${SeoDescription}` → call Titan with `inputText` → `textVec`
- Concurrency: 10 parallel requests; exponential backoff on throttle
- Write results to S3: `image-vectors.json` and `text-vectors.json` keyed by DesignID
- Estimated runtime: 2–3 hours; cost: ~$0.35

**3. Similarity computation script** — `scripts/compute-similar-designs.ts`
- Load both vector files from S3
- For each pair (i, j):
  `score = cosine(img[i], img[j]) × 0.75 + cosine(txt[i], txt[j]) × 0.25`
- 5,500² = 30M dot products ≈ 2–5 minutes in Node.js with typed arrays
- Keep top 20 per design, write `similar-designs.json` to S3
- Re-run whenever new designs are added

**4. API route** — `web/src/app/api/similar-designs/[designId]/route.ts`
- Load `similar-designs.json` from S3 once; cache at module level
- Return ordered array of full Design objects from the existing in-memory cache

**5. UI — "Similar Designs" block**
- Add to `designs/[designId]/page.tsx` below the main design content
- Display 12 designs in a grid using the existing `DesignCard` component
- Load via `fetch('/api/similar-designs/{id}')` after page render (not blocking LCP)

**6. New-upload pipeline**
- After a design is uploaded via WPF Uploader, trigger embedding generation for the new design
  and re-run `compute-similar-designs.ts` to update the map
- Can be a Lambda step or a local post-upload script

---

## Timeline

| Milestone | Effort | Notes |
|---|---|---|
| S1 | 2–3 days | Alt text batch + Next.js optimization + structured data + sitemap |
| S2 | 3–4 days | Taxonomy map + computed fields + filter UI + curated SEO pages |
| S3 | 3–4 days | Embedding batch (can run overnight) + similarity script + API + UI block |

**Total: ~10 days.**
S1 and S2 are independent and can overlap.
S3 embedding generation can run in the background while S1/S2 UI work is in progress.
