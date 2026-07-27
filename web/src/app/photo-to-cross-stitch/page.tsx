import type { Metadata } from 'next';
import Link from 'next/link';
import { buildCanonicalUrl } from '@/lib/url-helper';
import { stitchesToSize } from '@/lib/fabric-size';
import ConvertClient from './ConvertClient';
import HeroCta from './HeroCta';

const FABRIC_SIZE_COUNTS = [14, 16, 18];
const FABRIC_SIZE_STITCHES = [50, 80, 100, 120];

const TITLE = 'Photo to Cross-Stitch Pattern Maker – Free Online Converter';
const DESCRIPTION =
  'Free cross-stitch pattern maker: convert any photo into a custom chart with DMC thread colors, ' +
  'or start from a blank canvas and design your own from scratch. ' +
  'Use the built-in cross-stitch editor, set your stitch size, choose your palette, and download a print-ready PDF chart — ' +
  'your pet portrait, your garden, your favourite photo, ready to stitch on Aida or linen.';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  // designId/albumId are referrer-tracking params (which page linked here) —
  // real, valuable data we keep in the URL/analytics, but they turn this one
  // page into thousands of crawlable near-duplicate URLs (one per design/
  // album). Canonical alone wasn't enough — GSC classified them "Duplicate
  // without user-selected canonical" despite a correct canonical tag, likely
  // because so many of them are individually internally-linked. noindex on
  // just the referrer-tagged variants is the reliable fix; the bare URL and
  // ?source=-only variant stay indexable.
  const hasReferrerId = Boolean(params?.designId || params?.albumId);

  return {
    title: TITLE,
    description: DESCRIPTION,
    keywords: 'cross stitch pattern maker, photo to cross stitch pattern, image to cross stitch, turn photo into cross stitch, cross stitch editor, cross stitch pattern generator, custom cross stitch pattern, make your own cross stitch pattern, cross stitch pattern from photo, pet portrait cross stitch, convert photo to cross stitch, DMC pattern generator, cross stitch PDF, counted cross stitch pattern, cross stitch chart maker, cross stitch from photo, DMC floss colors, cross stitch for beginners, Aida fabric cross stitch, save cross stitch pattern, cross stitch pattern editor account',
    alternates: { canonical: buildCanonicalUrl('/photo-to-cross-stitch') },
    robots: hasReferrerId ? 'noindex, follow' : 'index, follow',
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: buildCanonicalUrl('/photo-to-cross-stitch'),
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: TITLE,
      description: DESCRIPTION,
    },
  };
}

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Cross-Stitch Pattern Maker & Photo Converter',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  description: DESCRIPTION,
  url: buildCanonicalUrl('/photo-to-cross-stitch'),
  featureList: [
    'Convert any JPEG, PNG or WebP photo to a cross-stitch pattern',
    'Start from a blank canvas and design a pattern by hand, no photo required',
    'Choose stitch width and height independently',
    'Automatic DMC thread color matching from 454 colors',
    'Reduce palette to 10, 15, 20 or 25 colors',
    'Color preview and symbol grid views',
    'Download printable PDF with color grid, symbol grid and color key',
    'Click any palette color to flash all its stitches on the chart',
    'Hide individual colors to stitch one thread at a time',
    'Use the chart on laptop, tablet, or phone — no printing required',
  ],
};

const FAQ = [
  {
    q: 'Is this a free cross-stitch pattern maker?',
    a: 'Yes. Converting a photo, editing the result, and downloading a print-ready PDF chart are all free — no software to install and no account needed just to try it.',
  },
  {
    q: 'Can I design a pattern without uploading a photo?',
    a: 'Yes. Choose "New Pattern" in the editor to start from a blank grid and place stitches by hand, one color at a time — the same repaint, fill, rotate and flip tools work whether your pattern started from a photo or from scratch.',
  },
  {
    q: 'What photo formats are supported?',
    a: 'JPEG, PNG, and WebP up to 5 MB. The converter works best with photos that have clear subjects and good contrast.',
  },
  {
    q: 'How do I choose the stitch count?',
    a: 'Set width and height in stitches independently. A 50×50 pattern stitched on 14-count Aida measures about 9×9 cm; an 80×80 pattern measures about 14×14 cm. Larger counts preserve more detail.',
  },
  {
    q: 'Which DMC colors will be used?',
    a: 'The converter picks the closest DMC floss color from a library of 454 standard shades for each part of your photo. If you set a color limit, the rarest shades are swapped for the nearest remaining one until your chosen number of colors is reached.',
  },
  {
    q: 'What does the PDF include?',
    a: 'Three pages: a colored grid showing each stitch in its DMC color, a symbol grid for black-and-white printing, and a color key table listing the symbol, DMC number, color name and stitch count for every thread.',
  },
  {
    q: 'Can I edit the pattern after converting?',
    a: 'Yes. The built-in editor lets you repaint individual stitches, change colors, fill whole areas, rotate, flip, and resize the pattern before you download the PDF. You can also re-import the same photo with different settings at any time.',
  },
  {
    q: 'Can I use the chart on my phone or laptop while stitching — without printing?',
    a: 'Yes. The pattern editor works on any device. You can hide all colors except the one you are currently stitching, so only those stitches are visible on screen. Click any color in the palette to make all its stitches flash on the chart so you can find your place instantly. Many stitchers keep the chart open on a laptop or tablet propped beside their hoop instead of printing.',
  },
  {
    q: 'Do I need an account?',
    a: 'Yes. You need a free account to save your pattern or download the PDF. Your patterns belong to you — once saved, only you can access, edit, or re-download them.',
  },
];

const faqStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
};

export default function PhotoToCrossStitchPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-6 py-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Free Cross-Stitch Pattern Maker — Turn Any Photo into a Chart
          </h1>
          <p className="text-gray-600 mb-8">
            Upload a photo of your pet, a flower, a favourite place — anything — and I&apos;ll convert it into a
            counted cross-stitch pattern with DMC thread colors. Or skip the photo and start from a blank canvas
            to design your own pattern by hand. Choose how many stitches wide, how many colors,
            and edit the result before downloading your printable PDF chart.
            Everything runs in your browser. No software, no account needed to try.
          </p>

          <HeroCta />

          <p className="text-xs text-gray-400 mb-8 -mt-4 text-center">
            Built by a cross-stitch designer who has spent more hours than she&apos;d like to admit counting stitches from a paper chart.
          </p>

          {/* Editor feature highlights */}
          <div className="mb-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="bg-white rounded-lg border border-gray-200 px-3 py-3 flex gap-2 items-start">
              <span className="text-lg flex-none leading-none mt-0.5">✨</span>
              <div>
                <p className="font-semibold text-gray-900 text-xs">Never lose your place</p>
                <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">Click any thread color and all its stitches light up on the chart at once.</p>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 px-3 py-3 flex gap-2 items-start">
              <span className="text-lg flex-none leading-none mt-0.5">👁</span>
              <div>
                <p className="font-semibold text-gray-900 text-xs">Work one thread at a time</p>
                <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">Hide all other colors so only the thread you&apos;re stitching is visible.</p>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 px-3 py-3 flex gap-2 items-start">
              <span className="text-lg flex-none leading-none mt-0.5">📱</span>
              <div>
                <p className="font-semibold text-gray-900 text-xs">Your chart on any device</p>
                <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">Keep the chart open on a tablet or phone propped beside your hoop. No printing, no paper to lose.</p>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 px-3 py-3 flex gap-2 items-start">
              <span className="text-lg flex-none leading-none mt-0.5">💾</span>
              <div>
                <p className="font-semibold text-gray-900 text-xs">Come back anytime</p>
                <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">Save your cross-stitch pattern to a free account and pick up right where you left off — no need to finish in one sitting.</p>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 px-3 py-3 flex gap-2 items-start">
              <span className="text-lg flex-none leading-none mt-0.5">🔗</span>
              <div>
                <p className="font-semibold text-gray-900 text-xs">Share with a friend</p>
                <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">Copy a link to your saved pattern and send it to anyone — great for showing a gift design before you stitch it.</p>
              </div>
            </div>
          </div>

          <ConvertClient />

          {/* FAQ — static HTML for crawlers */}
          <section className="mt-12 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              Frequently Asked Questions
            </h2>
            <dl className="space-y-5">
              {FAQ.map(({ q, a }) => (
                <div key={q}>
                  <dt className="font-semibold text-gray-800">{q}</dt>
                  <dd className="mt-1 text-gray-600 text-sm">{a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-8 grid gap-6 sm:grid-cols-2 text-sm text-gray-600">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Tips for the best result</h2>
              <ul className="space-y-2">
                <li><span className="font-medium text-gray-800">Choose a simple subject.</span> A pet portrait cross-stitch pattern comes out best from a photo with a single animal against a plain background. A single flower, a bird, or a landscape with a clear focal point also converts well. Busy group photos rarely make good patterns.</li>
                <li><span className="font-medium text-gray-800">Good contrast helps.</span> Photos with a clear difference between the subject and background give cleaner, more stitchable patterns.</li>
                <li><span className="font-medium text-gray-800">Start with fewer colors.</span> 10–15 thread colors is a lovely, manageable project. Add more if you want a portrait with fine detail.</li>
                <li><span className="font-medium text-gray-800">Try different sizes.</span> 50×50 stitches on 14-count Aida makes a 9×9 cm piece — a great quick project. 80×80 gives a 14×14 cm result with more detail.</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-3">What&apos;s in your PDF</h2>
              <ul className="space-y-2">
                <li><span className="font-medium text-gray-800">Color chart.</span> The full pattern printed in DMC thread colors — stitch from this when working in good light.</li>
                <li><span className="font-medium text-gray-800">Symbol chart.</span> The same pattern in black and white, each color shown as a unique symbol. Easier to read under a lamp and cheap to print.</li>
                <li><span className="font-medium text-gray-800">Thread list.</span> Every DMC color used, with its number, color name, and stitch count — so you know exactly which threads to buy. Cross-check any shade against the full <Link href="/dmc-color-chart" className="text-rose-600 underline hover:text-rose-700">DMC color chart</Link>.</li>
              </ul>
            </div>
          </section>

          <section className="mt-8 bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-sm text-gray-600">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Fabric and finished size guide</h2>
            <p className="mb-4">The size of your finished piece depends on how many stitches your pattern has and the count of your Aida fabric. Higher count = smaller stitches = finer detail. The most popular choice for beginners is 14-count Aida. For any other combination, use the <Link href="/cross-stitch-size-calculator" className="text-rose-600 underline hover:text-rose-700">cross-stitch size calculator</Link>.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-700">
                    <th className="text-left py-2 pr-4 font-semibold">Pattern size</th>
                    {FABRIC_SIZE_COUNTS.map((count) => (
                      <th key={count} className="text-left py-2 pr-4 font-semibold">{count}-count Aida</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {FABRIC_SIZE_STITCHES.map((stitches) => (
                    <tr key={stitches}>
                      <td className="py-2 pr-4 font-medium text-gray-800">{stitches} × {stitches} stitches</td>
                      {FABRIC_SIZE_COUNTS.map((count) => {
                        const size = stitchesToSize(stitches, count);
                        return (
                          <td key={count} className="py-2 pr-4">{size.cm.toFixed(0)} × {size.cm.toFixed(0)} cm ({size.inches.toFixed(1)}&Prime;)</td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-400">Always cut your fabric at least 5 cm (2&Prime;) larger on each side than the finished design — you will need that border for framing or finishing.</p>
          </section>

          <section className="mt-8 bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-sm text-gray-600">
            <h2 className="text-base font-semibold text-gray-900 mb-4">How to start stitching your pattern</h2>
            <ol className="space-y-3 list-none">
              <li className="flex gap-3"><span className="flex-none w-6 h-6 rounded-full bg-rose-100 text-rose-700 text-xs font-bold flex items-center justify-center">1</span><span><span className="font-medium text-gray-800">Print your PDF.</span> The symbol chart is easiest to follow while stitching — print it in black and white to save ink. Keep the color chart nearby to check thread shades.</span></li>
              <li className="flex gap-3"><span className="flex-none w-6 h-6 rounded-full bg-rose-100 text-rose-700 text-xs font-bold flex items-center justify-center">2</span><span><span className="font-medium text-gray-800">Prepare your fabric.</span> Cut your Aida at least 5 cm larger on every side than the finished design size. Overcast or tape the raw edges so they do not fray while you work.</span></li>
              <li className="flex gap-3"><span className="flex-none w-6 h-6 rounded-full bg-rose-100 text-rose-700 text-xs font-bold flex items-center justify-center">3</span><span><span className="font-medium text-gray-800">Find the center.</span> Fold the fabric in half both ways and mark the center with a pin or a few running stitches. Find the center of your chart — it is usually indicated on the printed PDF.</span></li>
              <li className="flex gap-3"><span className="flex-none w-6 h-6 rounded-full bg-rose-100 text-rose-700 text-xs font-bold flex items-center justify-center">4</span><span><span className="font-medium text-gray-800">Start from the center outward.</span> Beginning in the middle keeps the whole design centered on your fabric. Work in sections — complete one area before moving to the next.</span></li>
              <li className="flex gap-3"><span className="flex-none w-6 h-6 rounded-full bg-rose-100 text-rose-700 text-xs font-bold flex items-center justify-center">5</span><span><span className="font-medium text-gray-800">Use 2 strands of DMC floss</span> for 14-count Aida (the most common choice). Thread your size 24 tapestry needle with a length of about 40 cm — longer threads tangle and fray.</span></li>
              <li className="flex gap-3"><span className="flex-none w-6 h-6 rounded-full bg-rose-100 text-rose-700 text-xs font-bold flex items-center justify-center">6</span><span><span className="font-medium text-gray-800">Stitch one color at a time.</span> Work through all the stitches of one color before moving to the next — it is faster, uses less thread, and keeps the back tidy. In the editor, click any color to see its stitches flash on the chart, or hide all other colors so only the active one is visible.</span></li>
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
