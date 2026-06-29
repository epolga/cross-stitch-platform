# Editor Landing Page — Copy & Voice Plan

Companion to: `Editor Product Vision.md`
Covers: `web/src/app/photo-to-cross-stitch/page.tsx`, `HeroCta.tsx`, `ConvertClient.tsx`

---

## Goal

Make the landing page feel like it was written by someone who actually stitches — not a generic SaaS converter. Rewrite copy where it matters, trim noise where it doesn't.

The primary metric does not change: **Editor opened → First upload.** Everything above the editor must serve that. Everything below is secondary (SEO, reference for returning users).

---

## What's above the editor (the critical zone)

Current structure:
1. H1 — "Photo to Cross-Stitch Pattern Converter"
2. Description paragraph
3. HeroCta (Upload button + Try a Sample Image)
4. 3 feature cards

### H1 — keep as-is

SEO title. Google indexes this and it matches search intent. Do not change.

### Description paragraph — rewrite

**Current:**
> Turn any photo or image into a custom cross-stitch pattern with DMC thread colors. Choose your stitch size, adjust the palette, and download a print-ready PDF chart — your pet portrait, your garden, your favourite photo, ready to stitch. The pattern generator and cross-stitch editor run entirely in your browser — no software to install.

Problems:
- Reads like a product page, not a person speaking
- Lists features instead of describing the experience
- No warmth, no personality

**Proposed:**
> Upload a photo of your pet, a flower, a favourite place — anything — and I'll convert it into a counted cross-stitch pattern with DMC thread colors. Choose how many stitches wide, how many colors, and edit the result before downloading your printable PDF chart. Everything runs in your browser. No software, no account needed to try.

Changes: first-person ("I'll convert"), starts with the subject (the photo), ends with the lowest barrier to entry (no software, no account to try).

### HeroCta subtitle — keep as-is

"Upload a photo — I'll turn it into a cross-stitch pattern." — already personal and direct.

### Feature cards — rewrite

Current cards describe what the tool does mechanically. Rewrite to describe what the stitcher experiences.

| Current title | Current description | Proposed title | Proposed description |
|---|---|---|---|
| Find any color instantly | Click a color in the palette and all its stitches flash on the chart. | Never lose your place | Click any thread color and all its stitches light up on the chart at once. |
| Stitch one color at a time | Hide every other color with one click. | Work one thread at a time | Hide all other colors so only the thread you're stitching is visible. Finish one color completely before moving on. |
| No printing needed | Use the chart on your laptop, tablet, or phone beside your hoop. | Your chart on any device | Keep the chart open on a tablet or phone propped beside your hoop. No printing, no paper to lose. |

---

## "Built by a stitcher" moment

One small authentic message, placed naturally. Not a marketing block.

**Proposed placement:** Small text below the hero CTA, above the feature cards.

**Proposed text:**
> Built by a cross-stitch designer who has spent more hours than she'd like to admit counting stitches from a paper chart.

This is honest, human, slightly self-deprecating — exactly the tone the product vision describes. It explains *why* the editor exists without sounding like a pitch.

---

## Empty canvas state — warm up

**Current:**
> Drop a photo to start
> Drag any photo onto this area, or click Upload Your Photo above

**Proposed:**
> Ready when you are
> Drag a photo here, or click Upload Your Photo above — I'll do the rest.

Short, personal, low-pressure.

---

## What's below the editor (SEO zone)

These sections appear *after* the editor — they don't delay the first upload, so they're lower priority. They're also valuable for SEO and for returning users planning a project.

**Keep as-is (good content, right place):**
- Tips for the best result
- What's in your PDF
- Fabric and finished size guide
- How to start stitching your pattern

**FAQ — trim from 13 to 7 questions**

The current 13 FAQ items are long. Some are repetitive. Proposed: keep 7 that are most useful to a first-time visitor.

Keep:
1. What photo formats are supported?
2. How do I choose the stitch count?
3. Which DMC colors will be used?
4. What does the PDF include?
5. Can I edit the pattern after converting?
6. Do I need an account?
7. Can I use the chart on my phone without printing?

Remove (either covered above or less commonly asked):
- Can I stitch this on linen or evenweave? (advanced, niche)
- How much DMC thread will I need? (reference material, belongs elsewhere)
- What needle size should I use? (same)
- How long will this take to stitch? (not a product question)
- My photo has too many colors — which number should I pick? (covered by tips section)
- Can I make my own cross-stitch pattern from any photo? (redundant with H1)

---

## Implementation order

1. Description paragraph (one line in page.tsx)
2. Feature cards (three cards in page.tsx)
3. "Built by a stitcher" line (new element in page.tsx)
4. Empty canvas state (one line in ConvertClient.tsx)
5. FAQ trim (remove 6 entries from the FAQ array in page.tsx)

All changes are copy only — no new components, no structural changes.

## Done when

- [x] Description paragraph rewritten — 2026-06-29
- [x] Feature cards rewritten with stitcher voice — 2026-06-29
- [x] "Built by a stitcher" line added below hero — 2026-06-29
- [x] Empty canvas state warmed up — 2026-06-29
- [x] FAQ trimmed to 7 questions — 2026-06-29
