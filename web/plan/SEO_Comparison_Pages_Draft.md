# "vs [Competitor]" comparison pages — structure + first draft

Status: **draft for review, nothing built yet.** See
`Cross-Stitch_Competitor_Analysis.md` for the research behind this (KnytStudio's
`/compare/` hub + roundup post, and the same pattern independently confirmed on
Xstitchify, Stitchmate, and Cross-Stitched.com).

## Why this, why now

Every serious competitor in this niche runs dedicated "X vs [Product]" pages
that capture searches for a *competitor's own brand name* — traffic that a
generic "best cross-stitch pattern maker" post can't reach as precisely. We
have nothing in this category. It's now standard practice here, not a
one-off trick, so the downside risk of trying it is low.

## Proposed structure (reusable template)

URL scheme: `/compare/<competitor-slug>` (e.g. `/compare/knytstudio`),
matching the convention competitors already use — familiar to anyone who's
seen one of theirs, and reads cleanly as a URL.

Sections, in order:

1. **H1** — "`[Competitor]` vs Cross-Stitch.com: `<one-line framing>` (2026)"
2. **The short version** — 3-4 bullets per side, scannable in 10 seconds
3. **Feature comparison table** — price, catalog, photo-to-pattern, editor
   tools, progress tracking, mobile support, PDF export, account requirement
4. **Where `[Competitor]` wins** — one honest paragraph; never an all-wins page
5. **Where Cross-Stitch.com is different** — grounded in the real "why I
   built this" story (arthritis, evenings with a paper chart — already
   public via the `why-i-built-this` blog post), not generic feature-speak
6. **Bottom line** — one paragraph synthesis + link to the editor
7. **FAQ** (3-4 Qs) — same `FAQPage` JSON-LD pattern already used on
   `/photo-to-cross-stitch` (`page.tsx`), for snippet eligibility
8. **Other comparisons** — cross-links to sibling `/compare/` pages, added
   once more than one exists

Every claim about a competitor needs a "verified `<month year>`" mental
timestamp — their pricing/features will drift, and we should plan to
re-check each page during the existing monthly competitor scan
(`competitorScan.ts`) rather than let them go stale.

## First draft: Cross-Stitch.com vs KnytStudio

Picked KnytStudio first because our own competitor doc already flags them as
the closest-positioned rival, and their own "WinStitch vs Knytstudio" page
means capturing "knytstudio" search traffic sends already-comparison-shopping
people straight to us.

Facts used below, and where they came from:
- Our side: verified against the actual live site (not local dev, which had a
  stale `.env.local` showing a paid-mode banner that was never live) — the
  site is currently in `register` download mode: everything, including PDF
  downloads, is free while the download system is being improved; premium
  unlimited access is planned but not live yet. Free photo-to-pattern
  conversion and editor with no account required to try, account required
  only to save a pattern or download the PDF (both free right now), thousands
  of free print-ready patterns in the catalog, new Stitch Mode progress
  tracking (shipped 2026-07-29).
- KnytStudio's side: **re-verified today (2026-07-29) against their live
  `/pricing` page.** Free tier: 3 *saved* patterns, PNG export only, 5 AI
  generations/month — no PDF export and no progress tracker at all on Free.
  PDF/OXS export requires either "Unlock" (pay-per-pattern, from €2.99) or
  "Pro" (€4/month flat — exact price, not approximate), which also unlocks
  unlimited saves/exports, unlimited progress tracker, and 50 AI
  generations/month. Multi-craft support (cross-stitch/knitting/fuse
  beads/diamond painting/needlepoint), the "Discover" community gallery, and
  AI generation are from the prior competitor-analysis scan and weren't
  re-checked today — lower drift risk than pricing, but worth a glance before
  publishing too.

---

### H1
**KnytStudio vs Cross-Stitch.com: Multi-Craft AI Platform vs Free Photo-to-Pattern Editor (2026)**

### The short version

**KnytStudio** — a browser-based studio covering cross-stitch, knitting, fuse
beads, diamond painting, and needlepoint, with AI generation and a community
gallery. Free tier caps you at 3 saved patterns with PNG export only — PDF
export and progress tracking both require paying, either per-pattern or via
the €4/month Pro plan.

**Cross-Stitch.com** — cross-stitch only, but everything is free right now:
the photo-to-pattern converter, the full editor, generating as many patterns
as you like, and even PDF downloads, with no paid tier live yet. You only
need a free account to save a pattern or download the PDF, and the catalog
already has thousands of free, print-ready patterns to browse without
touching the editor at all.

### Feature comparison

| | KnytStudio | Cross-Stitch.com |
|---|---|---|
| Crafts supported | Cross-stitch, knitting, fuse beads, diamond painting, needlepoint | Cross-stitch only |
| Photo → pattern | ✅ | ✅ |
| Free pattern catalog to browse | ❌ (community "Discover" gallery of *user-made* patterns, not curated) | ✅ Thousands, free |
| Generate/edit without an account | Limited to 3 saved patterns on Free | ✅ Unlimited |
| Progress tracking while stitching | Paid only (Unlock or €4/mo Pro) | ✅ Free (Stitch Mode — mark cells, spotlight a color, syncs across devices) |
| PDF export | Paid only (from €2.99/pattern, or Pro) | ✅ Free (account required) |
| Pricing | Free (PNG only, 3 saves) / pay-per-pattern from €2.99 / €4 mo Pro | ✅ Everything free right now, no paid tier live yet |

### Where KnytStudio wins

If you work in more than one craft — say cross-stitch and diamond painting —
doing both in one place is a real convenience we don't offer, and their AI
text-to-pattern generator is a genuinely different way to start a design if
you're not working from a photo.

### Where Cross-Stitch.com is different

This site started as one stitcher's workaround, not a startup roadmap. I've
had mild arthritis in my hands for years — nothing dramatic, just stiffness
that made holding a paper chart flat and squinting at tiny grid squares
genuinely uncomfortable by evening. Every feature that lets you hide colors
while you stitch, save your place, or read a chart on a tablet propped
against the kettle, I built for myself first, on the evenings my hands
needed the help. That's also why there's no per-craft paywall maze here —
just cross-stitch, done properly, free to try without creating an account.

### Bottom line

If cross-stitch is the only craft you're after and you'd rather not hit a
3-pattern ceiling before you've even decided if a tool suits you,
[try the free converter](/photo-to-cross-stitch) — no account needed to see
your first pattern. If you regularly move between crafts, KnytStudio's
breadth is worth a look.

### FAQ

- **Is Cross-Stitch.com really free?** Yes — right now everything is free,
  including PDF downloads. Converting a photo, editing the pattern, and
  generating as many designs as you like need no account at all; a free
  account is only needed to save a pattern or download the PDF.
- **Does Cross-Stitch.com support other crafts besides cross-stitch?** No —
  cross-stitch only, by design.
- **Can I track my stitching progress like KnytStudio's Mark mode?** Yes —
  Stitch Mode lets you mark cells as stitched, spotlight one color's
  remaining stitches, and picks up where you left off on any device, free.
  KnytStudio's equivalent progress tracker requires a paid Unlock or Pro
  plan.
- **Which has a bigger pattern catalog?** Cross-Stitch.com has a curated,
  free catalog of thousands of ready-to-stitch patterns; KnytStudio's
  "Discover" gallery is user-submitted designs shared by its own community,
  not a curated catalog.

---

## Before this goes live

1. ~~Re-verify the KnytStudio facts above (pricing especially).~~ Done
   2026-07-29 against their live `/pricing` page (see facts note above) —
   multi-craft/AI/Discover-gallery claims still come from the prior
   competitor scan and weren't independently re-checked, worth a glance.
2. Decide whether this ships as a real Next.js route
   (`web/src/app/compare/[slug]/page.tsx`, data-driven so the second and
   third comparison pages are cheap to add) or a one-off page first to see
   how it performs.
3. Once live, add it to the monthly `competitorScan.ts` refresh cycle so the
   comparison table doesn't quietly go stale.
