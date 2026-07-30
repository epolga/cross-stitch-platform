# Cross-Stitch Editor Competitor Analysis

*Last updated: 2026-07-26 — refreshed from the monthly competitor scan's
DynamoDB rows (`CrossStitchBusinessHistory`, `EntityType=COMPETITOR`,
written by `automation/pinterest-agent/src/services/competitorScan.ts`).
That table is now the working source of truth (upserted monthly); this file
is a periodic human-readable snapshot of it, converted from the old
fixed-width ASCII table to a normal markdown table since it kept growing.*

| Project | Editor | Pattern Catalog | Strong SEO | Notes / Ideas to Study |
|---|---|---|---|---|
| **KnytStudio** | ✅ Modern web editor | ✅ Community "Discover" gallery (700+ user patterns, added ~2026-07) | ✅✅ Full `/compare/` hub — dedicated "X vs Knytstudio" pages for WinStitch, FlossCross, Pattern Keeper, Stitch Fiddle, and PCStitch, each with feature tables + FAQ schema + an "Other comparisons" block cross-linking all of them; plus a "Best Cross-Stitch Pattern Makers" roundup post (`/blog/best-cross-stitch-pattern-makers`) listing 15 tools including themselves with a disclosed "full disclosure: this is our platform" — captures both their own brand query and every competitor's brand-name search (found 2026-07-29) | Broadened into a multi-craft platform (needlepoint, fuse beads, diamond painting, knitting) with AI generation. Pricing re-verified 2026-07-29 against their live `/pricing` page: Free tier = 3 *saved* patterns, PNG export only, no PDF and no progress tracker at all; PDF/OXS export needs either pay-per-pattern "Unlock" (from €2.99) or "Pro" at exactly €4/mo (flat, not "~"), which also unlocks unlimited saves/exports and the progress tracker. Now blurs "editor" vs "catalog+editor" — closer to our own positioning than before. **Popularity check (2026-07-30):** actual market traction looks thin despite the aggressive SEO — Lord Libidan (independent, since 2009) rates it only 4.5/10 among online tools; no other third-party reviews found; no Wayback Machine snapshots even in early 2026 (very young domain); no findable social media presence; no press/funding coverage. Its search visibility looks driven almost entirely by its own comparison-page content, not real backlinks/reviews/community — swapped out of our own `/compare/` set in favor of Stitchmate, which has independent third-party validation. |
| **FlossCross** | ✅ Web editor | ⚠ Limited gallery | ❌ Weak SEO footprint | Strong editing capabilities, import/export, PDF generation. More tool than content site. No new findings this scan. |
| **Stitch Fiddle** | ✅ Web editor | ❌ No cross-stitch catalog | ✅ Mainly through articles and the tool itself | Launched a native mobile app "Stitch Fiddle & Craft Maker" (Google Play since Feb 2026, iOS since ~mid-2026) with in-app purchases (~$2.75/mo); users report core features like undo are now paywalled on mobile. |
| **Pic2Pat** | ⚠ Image-to-pattern converter | ❌ No catalog | ✅ Excellent SEO for "photo to pattern" queries | Specializes in image conversion rather than editing. Showing competitive erosion: backlinks down ~3.4% this month, and newer sites (Cross-Stitched, KnytStudio, Stitchmate) explicitly position it as the "worse alternative" in their own comparison content. |
| **Xstitchify** | ✅ Web editor + file import (.oxs/.xsd/.pat) | ❌ No catalog | ✅ Aggressive named "vs WinStitch/Stitch Fiddle/Pic2Pat" comparison pages | Photo/text/QR-code/AI-prompt → pattern. DMC matching via Delta-E/CIELAB (we already do Lab-space CIE76 — see Focus.md open item on a CIEDE2000 upgrade). Freemium: 5 free PDFs, then $9.99/mo (stitch tracker, custom fonts, AI credits, commercial rights) or pay-per-credit packs. Recently added a stitchable QR-code generator and a prompt-to-editor AI generator; June 2026 terms update. Launched January 2026 — still young, but technically capable and already monetizing. |
| **WinStitch / PCStitch** | ✅ Desktop editors | ❌ No catalog | ❌ | Mature desktop software, traditional workflow. Increasingly cited by newer web tools as "legacy/unmaintained" (PCStitch: no meaningful update since ~2016) in their own comparison SEO content. |
| **Pattern Keeper** | ❌ Viewer / stitching assistant (not a full editor) | ❌ | ❌ | Excellent UX for stitching existing PDFs, strong mobile experience. Shipped a May 2026 update adding tentative fractional/partial-stitch support and the ability to flag stitches to unpick later. |
| **Cross Stitch Professional Platinum** | ✅ Desktop editor | ❌ | ❌ | Professional desktop package aimed at designers. No new findings this scan. |
| **Stitchmate.app** *(new, found 2026-07-26)* | ✅ Web editor | ❌ No catalog | ✅ Heavy comparison-content SEO vs. PCStitch/WinStitch/Stitch Fiddle/FlossCross | Modern browser-based editor with a distinctive "FLOW Score" stitchability rating and a confetti-cleanup brush. Pay-per-export, not subscription: free editor + PNG, $3.99/pattern PDF or $99 lifetime, $99-149/yr commercial license for sellers. Standalone desktop app shipping 2026. Closest functional clone of our own editor's value proposition found so far — worth watching closely. **Popularity confirmed (2026-07-30):** independently reviewed and ranked 3rd among online tools by Lord Libidan (9.5/10, "predicted to become one of the biggest tools to hit the cross stitch market") — genuine third-party validation, unlike most others on this list. Now our featured #2 comparison on `/compare/stitchmate` (swapped in for KnytStudio). |
| **Cross-Stitched.com** *(new, found 2026-07-26)* | ✅ Web editor | ❌/unclear (blog roundups, not a hosted catalog) | ✅ | Free photo-to-pattern + text/lettering generator; blog content explicitly attacks Pic2Pat's limitations, runs "best pattern maker" roundup posts. |
| **AI generalist tools** *(category, not one product — Pixlio AI, Musely, Pixa.com)* | ⚠ Limited (one feature among many unrelated AI tools) | ❌ | ❓ Unclear | Broad multi-purpose AI image-tool sites bolting on a cross-stitch generator as one of dozens of features. Low specialization, likely low loyalty — a search-traffic/keyword-competition trend to monitor, not a deep product threat. |
| **Cross-Stitch.com (current vision)** | 🚧 In development | ✅ ~5,500 free patterns | 🚧 Growing rapidly | Potential combination of strong SEO catalog + modern editor + image conversion + automatic confetti removal + realistic stitch preview. |

## Competitive observations

Most competitors focus on **either**:

1.  A good editor with little SEO/content.
2.  A catalog of patterns without a powerful editor.

The combination of:

-   a large SEO-driven catalog,
-   free downloadable patterns,
-   and a modern browser editor

appears to be relatively uncommon in this niche — though KnytStudio's new
community gallery and Stitchmate's rapid rise show the gap is being
noticed and partly closed from the "editor" side.

## Features worth benchmarking

-   Image → pattern conversion
-   Manual editing UX
-   Automatic confetti reduction
-   Palette optimization
-   Realistic stitch preview
-   PDF export
-   Progress tracking
-   Browser performance on large designs
-   Community sharing/remixing (KnytStudio's "Discover" gallery)
-   "Stitchability" scoring before committing to a pattern (Stitchmate's
    "FLOW Score") — a novel idea worth considering
-   Pattern-file import (.oxs/.xsd/.pat) for editing others' existing charts
    (Xstitchify) — we have the reverse direction covered instead: our own
    catalog PDFs → editable grid, see the Catalog PDF-to-Editable Conversion
    findings doc
-   **Competitor-name SEO hub** — now confirmed independently across four
    competitors (KnytStudio's `/compare/` pages + roundup post, Xstitchify's
    and Stitchmate's "vs WinStitch/Stitch Fiddle/Pic2Pat" pages, and
    Cross-Stitched.com's "best pattern maker" roundups): dedicated "X vs
    [Product]" landing pages, cross-linked to each other, plus a self-
    inclusive "best of" roundup post — captures search traffic for every
    competitor's own brand name, not just generic keywords. This is now the
    norm in this niche, not a one-off tactic; we have nothing in this
    category. Worth a dedicated look once catalog/editor work settles.
-   Monetization model — three different approaches now visible in the
    market: Xstitchify's freemium + $9.99/mo subscription, KnytStudio's
    freemium + ~€4/mo, and Stitchmate's pay-per-export ($3.99/pattern or
    $99 lifetime, no subscription at all). Worth comparing against when we
    eventually design our own paywall (no real paid tier yet — 598/1574
    users grandfathered free-premium ahead of a future paywall).

## How this file is kept current

A monthly automated scan (`competitorScan.ts`, same day-of-month as the
AI-tools-scan) searches for new competitors and new features/pricing on
known ones, and upserts findings into DynamoDB
(`CrossStitchBusinessHistory`, `EntityType=COMPETITOR`) — read via
`getAllCompetitors()` in `historyStore.ts`. It emails/Telegrams a narrative
report but does **not** edit this file directly (the Lambda has no access
to the git checkout). Refresh this table from the DDB rows periodically —
don't let it silently drift far out of sync with what the scan has found.
