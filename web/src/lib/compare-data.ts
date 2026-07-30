export interface ComparisonTableRow {
  label: string;
  them: string;
  us: string;
  usWins?: boolean;
}

export interface ComparisonFaq {
  q: string;
  a: string;
}

export interface ComparisonEntry {
  slug: string;
  competitorName: string;
  h1: string;
  metaDescription: string;
  shortVersionThem: string;
  shortVersionUs: string;
  tableRows: ComparisonTableRow[];
  whereTheyWin: string;
  whereWeDiffer: string;
  bottomLine: string;
  faq: ComparisonFaq[];
  // Date the facts below were last checked against the competitor's own
  // site — pricing/limits drift, so this is what keeps the page honest.
  // Re-verify (and bump) during the monthly competitor scan.
  verifiedDate: string;
  sourcesNote?: string;
}

export const comparisons: ComparisonEntry[] = [
  {
    slug: 'stitchmate',
    competitorName: 'Stitchmate',
    h1: 'Stitchmate vs Cross-Stitch.com: Pay-Per-Export Pattern Studio vs Free Photo-to-Pattern Editor',
    metaDescription:
      'Stitchmate vs Cross-Stitch.com compared: pay-per-export pricing, FLOW Score pattern quality, confetti cleanup, and pattern catalogs — an honest, fact-checked comparison.',
    shortVersionThem:
      "A modern pattern studio (browser-based, with apps for Mac, Windows, iPad, iPhone, Android, and Chromebook) built around a distinctive \"FLOW Score\" — a 0-100 rating of how enjoyable a pattern will be to stitch, based on confetti density and thread transitions — plus one-click confetti cleanup. The free tier includes the full editor, FLOW Score, and PNG/watermarked-demo-PDF export; a real, watermark-free PDF costs $3.99/pattern (permanent) or $99 lifetime for unlimited, with a separate $99/yr or $149-lifetime commercial license for sellers. No subscription.",
    shortVersionUs:
      "Cross-stitch only, but everything is free right now: the photo-to-pattern converter, the full editor, generating as many patterns as you like, and real (non-watermarked) PDF downloads, with no paid tier live yet. A free account is only needed to save a pattern or download the PDF, and the catalog already has thousands of free, print-ready patterns to browse without touching the editor at all.",
    tableRows: [
      { label: 'Pattern-quality scoring', them: '✅ FLOW Score (0-100, predicts how enjoyable a pattern is to stitch)', us: 'Not offered' },
      { label: 'Photo → pattern', them: '✅', us: '✅' },
      { label: 'Free pattern catalog to browse', them: '❌', us: '✅ Thousands, free', usWins: true },
      { label: 'Real (non-watermarked) PDF export', them: '$3.99/pattern or $99 lifetime — not on the free tier', us: '✅ Free right now (account required)', usWins: true },
      { label: 'Progress tracking while stitching', them: 'Not advertised as a feature', us: '✅ Free (Stitch Mode — mark cells, spotlight a color, syncs across devices)', usWins: true },
      { label: 'Platform', them: 'Browser + native apps (Mac, Windows, iPad, iPhone, Android, Chromebook)', us: 'Browser-based, any device' },
      { label: 'Pricing model', them: 'Free editor, pay-per-export ($3.99/pattern or $99 lifetime), no subscription', us: '✅ Everything free right now, no paid tier live yet', usWins: true },
    ],
    whereTheyWin:
      "FLOW Score is a genuinely useful idea we don't have an equivalent of — knowing before you commit whether a pattern will be a smooth stitch or a confetti nightmare is valuable, and their one-click confetti cleanup is well-regarded. Pay-per-export with no subscription is also an honest, simple model if you only need the occasional pattern and don't mind paying per download.",
    whereWeDiffer:
      "This site started as one stitcher's workaround, not a startup roadmap. I've had mild arthritis in my hands for years — nothing dramatic, just stiffness that made holding a paper chart flat and squinting at tiny grid squares genuinely uncomfortable by evening. Every feature that lets you hide colors while you stitch, save your place, or read a chart on a tablet propped against the kettle, I built for myself first, on the evenings my hands needed the help. That's also why a real, finished PDF isn't locked behind a per-pattern fee here — just cross-stitch, free to try and free to take home right now.",
    bottomLine:
      "If you want a finished, watermark-free PDF without paying per pattern, try the free converter — no account needed to see your first result. If a pattern-quality score before you commit to stitching it matters more to you than price, Stitchmate's FLOW Score is worth a look.",
    faq: [
      {
        q: 'Is Cross-Stitch.com really free, including the PDF?',
        a: 'Yes — right now everything is free, including a real, non-watermarked PDF download. Converting a photo, editing the pattern, and generating as many designs as you like need no account at all; a free account is only needed to save a pattern or download the PDF.',
      },
      {
        q: 'Does Cross-Stitch.com have anything like Stitchmate\'s FLOW Score?',
        a: "Not currently — Stitchmate's 0-100 pattern-quality prediction is a feature we don't offer. What we do have is Stitch Mode, a free progress-tracking system for once you're actually stitching.",
      },
      {
        q: 'Do I have to pay per pattern to get a usable PDF?',
        a: "On Stitchmate, yes — the free tier's PDF export is a watermarked demo; a real PDF is $3.99/pattern or $99 lifetime for unlimited. On Cross-Stitch.com, PDF export is free right now with a free account, no per-pattern fee.",
      },
      {
        q: 'Which has a bigger pattern catalog?',
        a: "Cross-Stitch.com has a curated, free catalog of thousands of ready-to-stitch patterns. Stitchmate doesn't offer a browsable pattern catalog — it's a design tool, not a catalog site.",
      },
    ],
    verifiedDate: '2026-07-30',
    sourcesNote: "Pricing/features verified via stitchmate.app's own pricing page title and search-indexed content on 2026-07-30 (their site blocks direct automated fetches, so this wasn't read from a single rendered page — cross-checked across their pricing page, FAQ, and an independent Lord Libidan review, which consistently agree on the $3.99/$99/$99-149 figures). Re-verify directly before publishing if possible.",
  },
  {
    slug: 'winstitch',
    competitorName: 'WinStitch',
    h1: 'WinStitch vs Cross-Stitch.com: Veteran Desktop Software vs Free Browser Editor',
    metaDescription:
      'WinStitch vs Cross-Stitch.com compared: one-time desktop purchase vs free browser editor, photo-to-pattern conversion, and mobile access — an honest comparison.',
    shortVersionThem:
      "Windows desktop software (with a companion Mac version, MacStitch) from Ursa Software — a one-time purchase, around £46, with optional paid yearly upgrades. Decades of development behind it: converts photos or hand-drawn art, prints up to A2, calculates thread quantities, exports PDF, and even supports diamond painting and crochet chart output. A free demo is available before buying.",
    shortVersionUs:
      "A free browser-based photo-to-pattern converter and editor — cross-stitch only, no install, works on a phone or tablet as easily as a laptop. Nothing to buy: converting a photo and editing the result are free with no account, and even the PDF download is free right now (account required to save/download).",
    tableRows: [
      { label: 'Platform', them: 'Windows/Mac desktop app, install required', us: '✅ Browser-based — any device, nothing to install', usWins: true },
      { label: 'Photo → pattern', them: '✅', us: '✅' },
      { label: 'Try before you buy', them: 'Free demo (limited)', us: '✅ Full converter and editor, free, no account', usWins: true },
      { label: 'Price', them: 'One-time ~£46 (regional tax varies), optional paid yearly upgrades', us: '✅ Free right now, no paid tier live yet', usWins: true },
      { label: 'Free pattern catalog to browse', them: '❌', us: '✅ Thousands, free', usWins: true },
      { label: 'Use on phone/tablet while stitching', them: '❌ Desktop only', us: '✅ Any device, plus Stitch Mode progress tracking', usWins: true },
      { label: 'Max print size', them: '✅ Up to A2', us: 'Standard letter/A4 PDF pages' },
    ],
    whereTheyWin:
      "WinStitch has nearly three decades of refinement behind it — specialty stitch types, large-format A2 printing, and file compatibility going back to old PCStitch charts are the kind of depth a young browser tool can't match yet. If you already own a large existing library of charts in older formats, that compatibility alone may be worth the one-time price.",
    whereWeDiffer:
      "I built this after years of squinting at paper charts under a lamp, my hands stiff with mild arthritis by evening — I wanted a chart I could pull up on a tablet propped against the kettle, zoom into without holding anything flat, and pick back up mid-row without losing my place. A one-time desktop purchase makes sense if you're settling in for the long haul with one machine; a free browser tool makes more sense if you want to try converting a photo right now, on whatever screen is in front of you, without installing anything or paying first.",
    bottomLine:
      "If you want to see a real pattern from your own photo in the next two minutes, without installing anything or reaching for a card, try the free converter. If you're after specialty stitch types, A2-format printing, or you're already deep in the WinStitch ecosystem, its maturity is hard to argue with.",
    faq: [
      {
        q: 'Do I have to install anything to use Cross-Stitch.com?',
        a: 'No — it runs entirely in your browser, on desktop, tablet, or phone. WinStitch is a Windows/Mac desktop application you install after purchase.',
      },
      {
        q: 'Is there a free way to try WinStitch?',
        a: "Yes, Ursa Software offers a free demo, though the full version is a one-time purchase (around £46, regional tax may vary). Cross-Stitch.com's converter and editor are free to use with no purchase.",
      },
      {
        q: 'Can I use Cross-Stitch.com on my phone while stitching?',
        a: "Yes — the editor works on any device, and Stitch Mode lets you mark stitched cells and pick up where you left off, even on a different device. WinStitch is desktop-only.",
      },
    ],
    verifiedDate: '2026-07-30',
    sourcesNote: 'WinStitch pricing/features verified against ursasoftware.com on 2026-07-30.',
  },
  {
    slug: 'stitch-fiddle',
    competitorName: 'Stitch Fiddle',
    h1: 'Stitch Fiddle vs Cross-Stitch.com: Free Grid Tool vs Free Photo-to-Pattern Editor',
    metaDescription:
      'Stitch Fiddle vs Cross-Stitch.com compared: which free tier actually lets you convert a photo, pattern catalogs, and pricing — an honest, fact-checked comparison.',
    shortVersionThem:
      'A free, no-signup-required browser grid editor with a long track record. The free tier stays free forever, but it caps you at 15 saved charts, a 300×300 grid, 50 colors — and does not include photo uploads at all. Photo-to-pattern conversion, unlimited charts, larger grids, and extra export formats require Premium at €2.25/month billed annually (€27/year) or €4.50/month with no commitment.',
    shortVersionUs:
      "Cross-stitch only, but photo-to-pattern conversion is free on the free tier — not a paid upgrade. Convert a photo, edit the result, and generate as many patterns as you like with no account; the catalog also has thousands of free, ready-to-stitch patterns to browse without using the editor at all.",
    tableRows: [
      { label: 'Photo → pattern on the free tier', them: '❌ Free tier has no photo upload — Premium only', us: '✅ Free, no account needed', usWins: true },
      { label: 'Saved charts on free tier', them: '15', us: '✅ Unlimited', usWins: true },
      { label: 'Free pattern catalog to browse', them: '❌', us: '✅ Thousands, free', usWins: true },
      { label: 'Grid size', them: 'Free: 300×300 · Premium: 1,000×1,000', us: 'Set any width/height in stitches, independently' },
      { label: 'Progress tracking while stitching', them: 'Not listed as a feature', us: '✅ Free (Stitch Mode)', usWins: true },
      { label: 'Pricing', them: 'Free (no photo upload) / €2.25-4.50/mo Premium', us: '✅ Everything free right now, no paid tier live yet', usWins: true },
    ],
    whereTheyWin:
      "Stitch Fiddle's from-scratch grid editor is mature and well-liked for hand-designing charts — including non-cross-stitch grids like knitting/crochet colorwork — and its free tier, while limited, needs no signup at all to start drawing immediately. If photo conversion isn't what you're after, it's a genuinely solid free option.",
    whereWeDiffer:
      "The whole reason this site exists is a photo becoming a stitchable pattern without friction — that's the free tier here, not something you unlock later. I built it that way because I wanted the same ease for anyone else whose hands or evenings don't leave room for a learning curve before the free version even does the one thing you came for.",
    bottomLine:
      "If turning an actual photo into a pattern is why you're here, Stitch Fiddle's free tier won't do that — try the free converter instead, no signup required to see the result. If you want to hand-draw a chart from scratch and don't mind a 15-chart cap, Stitch Fiddle is a capable, well-established option.",
    faq: [
      {
        q: 'Can I convert a photo to a pattern for free on Stitch Fiddle?',
        a: "No — photo uploads are a Premium-only feature on Stitch Fiddle (from €2.25/month billed annually). Cross-Stitch.com's photo converter is free with no account.",
      },
      {
        q: 'Does Cross-Stitch.com limit how many patterns I can save?',
        a: "No — generating and editing patterns is unlimited and free; an account (also free) is only needed to save a pattern or download its PDF.",
      },
      {
        q: 'Which is better for designing a chart from scratch by hand?',
        a: "Both support it. Cross-Stitch.com's editor includes pencil, fill, shape, and mirror tools alongside the photo converter; Stitch Fiddle is a dedicated grid-drawing tool with a longer track record for that specific use case, including non-cross-stitch grids.",
      },
    ],
    verifiedDate: '2026-07-30',
    sourcesNote: 'Stitch Fiddle pricing/limits verified against stitchfiddle.com/en/pricing on 2026-07-30.',
  },
  {
    slug: 'pic2pat',
    competitorName: 'Pic2Pat',
    h1: 'Pic2Pat vs Cross-Stitch.com: Simple Photo Converter vs Free Photo-to-Pattern Editor',
    metaDescription:
      'Pic2Pat vs Cross-Stitch.com compared: photo-to-pattern conversion, manual editing tools, and pattern catalogs — an honest, fact-checked comparison.',
    shortVersionThem:
      "One of the oldest photo-to-cross-stitch converters online, in continuous use since the early 2010s. Upload a photo, choose colors, fabric count, and width, and it generates a downloadable PDF chart with a symbol grid, color key, and thread list. Generating a pattern is presented as free on their own site; there's no built-in tool to manually repaint, resize, or otherwise edit the result afterward — it's a converter, not an editor.",
    shortVersionUs:
      "Also converts a photo to a pattern for free, but the result opens straight into a full editor — repaint cells, change or merge colors, resize, mirror, undo — the same one used for every design in the catalog, so you're never stuck with the first automatic result.",
    tableRows: [
      { label: 'Photo → pattern', them: '✅', us: '✅' },
      { label: 'Edit the pattern after converting', them: '❌ No built-in editor', us: '✅ Full editor: repaint, resize, mirror, fill, undo', usWins: true },
      { label: 'Free pattern catalog to browse', them: '❌', us: '✅ Thousands, free', usWins: true },
      { label: 'Save and come back later', them: 'Not applicable — no accounts/editor', us: '✅ Free account, resume anytime' },
      { label: 'Progress tracking while stitching', them: '❌', us: '✅ Free (Stitch Mode)', usWins: true },
      { label: 'Account required to generate', them: '❌', us: '❌' },
    ],
    whereTheyWin:
      "Pic2Pat is about as simple as photo-to-pattern conversion gets — upload, pick a few settings, download. If all you want is a quick chart with no editor to learn, that simplicity is genuinely appealing, and it's a long-standing, well-known tool in the community for exactly that reason.",
    whereWeDiffer:
      "An automatic conversion is a starting point, not always the finished design — a stray pixel of background color, a face that needs one more shade of skin tone, a palette that's one color too busy. I built the editor because my own converted patterns needed that second pass, and I didn't want to redo the whole conversion from scratch just to fix one thing.",
    bottomLine:
      "If you want to fine-tune the pattern a photo converter gives you — merge two similar colors, clean up stray pixels, resize for different fabric — try the free converter and editor. If you just want a fast, no-frills chart and don't expect to touch it afterward, Pic2Pat's simplicity has its own appeal.",
    faq: [
      {
        q: 'Can I edit my pattern after converting it on Pic2Pat?',
        a: "Pic2Pat doesn't include a built-in editor — it generates a chart directly from your settings. Cross-Stitch.com's converter opens straight into a full editor for repainting, resizing, and cleaning up the result.",
      },
      {
        q: 'Is Cross-Stitch.com also free to convert a photo?',
        a: "Yes — converting a photo and editing the result are free with no account. An account (also free right now) is only needed to save the pattern or download the PDF.",
      },
      {
        q: 'Does either site have a browsable pattern catalog?',
        a: "Cross-Stitch.com has a curated, free catalog of thousands of ready-to-stitch patterns. Pic2Pat is a converter only, with no catalog to browse.",
      },
    ],
    verifiedDate: '2026-07-30',
    sourcesNote: "Pic2Pat's own site doesn't clearly state PDF pricing; some third-party reviews mention a historical per-pattern fee that wasn't independently confirmed on 2026-07-30 — verify again before publishing if exact pricing claims are added.",
  },
];

export function getComparison(slug: string): ComparisonEntry | undefined {
  return comparisons.find(c => c.slug === slug);
}
