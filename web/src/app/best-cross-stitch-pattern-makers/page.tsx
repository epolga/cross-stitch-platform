import type { Metadata } from 'next';
import Link from 'next/link';
import { buildCanonicalUrl } from '@/lib/url-helper';
import { comparisons } from '@/lib/compare-data';

const TITLE = 'Best Cross-Stitch Pattern Makers in 2026 (Free & Paid)';
const DESCRIPTION =
  "An honest, fact-checked roundup of the best cross-stitch pattern makers in 2026 — free and paid, browser and desktop — including where Cross-Stitch.com fits in. Full disclosure: this is our platform, listed alongside the rest.";
const PAGE_DATE = '2026-07-30';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: 'best cross stitch pattern maker, best cross stitch pattern makers 2026, free cross stitch pattern maker, cross stitch software comparison, cross stitch pattern generator',
  alternates: { canonical: buildCanonicalUrl('/best-cross-stitch-pattern-makers') },
  robots: 'index, follow',
  openGraph: { title: TITLE, description: DESCRIPTION, url: buildCanonicalUrl('/best-cross-stitch-pattern-makers'), type: 'article' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

function compareLink(slug: string): string | null {
  return comparisons.some(c => c.slug === slug) ? `/compare/${slug}` : null;
}

interface Entry {
  name: string;
  bestFor: string;
  blurb: string;
  compareSlug?: string;
  external?: boolean;
}

const entries: Entry[] = [
  {
    name: 'Cross-Stitch.com',
    bestFor: 'A free photo-to-pattern converter with a full editor and a big catalog to browse',
    blurb:
      "Full disclosure: this is our own platform, so take this entry with the grain of salt it deserves — but here's what it actually does. Convert a photo to a stitchable pattern free, with no account, then edit it in a full browser-based editor (repaint, resize, mirror, undo). Stitch Mode lets you mark cells as you go and pick up where you left off on any device, and there's a curated catalog of thousands of free, ready-to-stitch patterns if you'd rather not start from a photo at all. Everything, including PDF downloads, is free right now.",
  },
  {
    name: 'Stitchmate',
    bestFor: 'A FLOW Score that predicts how enjoyable a pattern will be to stitch, before you commit',
    blurb:
      'A modern pattern studio (browser plus native apps for Mac, Windows, iPad, iPhone, Android, and Chromebook) built around "FLOW Score," a 0-100 rating of confetti density and thread transitions, plus one-click confetti cleanup. Independently reviewed by Lord Libidan — ranked 3rd among online tools at 9.5/10, with reviewers predicting it could become one of the biggest tools in the space. Free tier includes the full editor and FLOW Score; a real, watermark-free PDF costs $3.99/pattern or $99 lifetime, no subscription.',
    compareSlug: 'stitchmate',
  },
  {
    name: 'WinStitch / MacStitch',
    bestFor: 'Stitchers who want mature, offline desktop software and don\'t mind a one-time purchase',
    blurb:
      "Veteran Windows/Mac desktop software from Ursa Software, in development for decades. One-time purchase (around £46, regional tax varies), with A2-size printing, thread-quantity calculation, and file compatibility going back to old PCStitch charts. No browser or mobile version — it's a full install.",
    compareSlug: 'winstitch',
  },
  {
    name: 'Stitch Fiddle',
    bestFor: 'Hand-drawing a chart from scratch, free, with no signup',
    blurb:
      "A well-established, no-signup browser grid editor. The free tier stays free forever but caps you at 15 charts and a 300×300 grid — and doesn't include photo uploads at all. Photo conversion, unlimited charts, and larger grids need Premium, from €2.25/month billed annually.",
    compareSlug: 'stitch-fiddle',
  },
  {
    name: 'Pic2Pat',
    bestFor: 'The fastest possible photo-to-chart conversion, with nothing else to learn',
    blurb:
      "One of the oldest photo-to-cross-stitch converters online, in continuous use since the early 2010s. Upload a photo, pick a few settings, download a PDF chart — there's no built-in editor to repaint or clean up the result afterward, which is either a limitation or exactly the simplicity you want.",
    compareSlug: 'pic2pat',
  },
  {
    name: 'Xstitchify',
    bestFor: 'Importing existing chart files (.oxs/.xsd/.pat) to keep editing them',
    blurb:
      'A newer web editor (launched early 2026) with photo, text, QR-code, and AI-prompt pattern generation, plus support for importing existing chart files in several formats. Freemium: a handful of free PDFs, then a paid plan for unlimited exports and extras like custom fonts and commercial rights.',
  },
  {
    name: 'Pattern Keeper',
    bestFor: 'Following a pattern you already own, not designing a new one',
    blurb:
      "Not a pattern maker at all, technically — it's a stitching companion app for reading and tracking progress on PDF/chart files you already have, with a strong mobile experience. Worth knowing about if what you actually need is help following an existing chart, not creating one.",
  },
];

const faq = [
  {
    q: 'Is Cross-Stitch.com really on this list objectively?',
    a: "It's our own platform, so read our entry with that in mind — we've tried to describe it the same plain way as the others, and we've fact-checked every competitor entry against their own current site rather than relying on old notes.",
  },
  {
    q: 'What\'s the best free option if I just want to convert one photo?',
    a: 'Cross-Stitch.com and Pic2Pat both convert a photo to a pattern for free with no account. The difference is what happens after: Cross-Stitch.com opens the result in a full editor to fix it up, Pic2Pat gives you the chart as-is.',
  },
  {
    q: 'Which of these work on a phone or tablet, not just desktop?',
    a: 'Cross-Stitch.com, Stitchmate, Stitch Fiddle, Xstitchify, and Pattern Keeper are all browser-based (Stitchmate also has native apps) and work on any device. WinStitch/MacStitch and PCStitch are desktop-only installs.',
  },
];

export default function BestPatternMakersPage() {
  const faqStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">{TITLE}</h1>
          <p className="text-gray-600 mb-1">
            By Ann Logan, updated {new Date(PAGE_DATE).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <p className="text-sm text-gray-500 mb-8 italic">
            Full disclosure: I built Cross-Stitch.com, and it&apos;s on this list. I&apos;ve tried to
            be as honest about its limits as everyone else&apos;s — pricing and features below are
            checked against each tool&apos;s own site, not old marketing copy.
          </p>

          <div className="space-y-4 mb-10">
            {entries.map((entry, i) => {
              const href = entry.compareSlug ? compareLink(entry.compareSlug) : null;
              return (
                <div key={entry.name} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-gray-400 text-sm font-mono">{i + 1}.</span>
                    <h2 className="text-lg font-semibold text-gray-900">{entry.name}</h2>
                  </div>
                  <p className="text-xs uppercase tracking-wide text-green-700 font-semibold mb-2">Best for: {entry.bestFor}</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{entry.blurb}</p>
                  {href && (
                    <Link href={href} className="inline-block mt-3 text-sm text-rose-600 underline hover:text-rose-700">
                      Full {entry.name} vs Cross-Stitch.com comparison →
                    </Link>
                  )}
                </div>
              );
            })}
          </div>

          <section className="mb-10 bg-green-50 border border-green-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">My honest take</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              If a photo is where you&apos;re starting from and you want room to fix the result
              afterward, try the free converter — it&apos;s free to convert, edit, and now even
              download, no strings yet. If you need multiple crafts in one place, or you&apos;re
              committed to offline desktop software, one of the others above is genuinely the
              better fit — I&apos;d rather send you to the right tool than pretend there isn&apos;t one.
            </p>
            <Link
              href="/photo-to-cross-stitch"
              className="inline-block mt-4 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              Try the free converter →
            </Link>
          </section>

          <section className="mb-10 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">Frequently asked questions</h2>
            <dl className="space-y-4">
              {faq.map(({ q, a }) => (
                <div key={q}>
                  <dt className="font-semibold text-gray-800 text-sm">{q}</dt>
                  <dd className="mt-1 text-gray-600 text-sm leading-relaxed">{a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <p className="text-sm text-gray-600">
            Want the full side-by-side breakdown instead of a summary?{' '}
            <Link href="/compare" className="text-rose-600 underline hover:text-rose-700">
              See all detailed comparisons
            </Link>.
          </p>

          <p className="text-xs text-gray-400 mt-8">
            Last checked {PAGE_DATE}. Stitchmate, WinStitch/MacStitch, Stitch Fiddle, and Pic2Pat
            were verified against their own current sites (Stitchmate cross-checked via search-indexed
            content and an independent Lord Libidan review, since their site blocks direct automated
            fetches); Xstitchify and Pattern Keeper reflect our last periodic competitor scan and
            weren&apos;t independently re-checked on this date. Pricing and features change — if
            something here looks out of date, <a href="mailto:ann@cross-stitch.com" className="underline hover:text-gray-600">let us know</a>.
          </p>
        </div>
      </div>
    </>
  );
}
