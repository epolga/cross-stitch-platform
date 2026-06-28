import type { Metadata } from 'next';
import { buildCanonicalUrl } from '@/lib/url-helper';
import ConvertClient from './ConvertClient';

const TITLE = 'Photo to Cross-Stitch Pattern Converter';
const DESCRIPTION =
  'Convert any photo into a counted cross-stitch pattern with DMC thread colors. ' +
  'Set your stitch size, choose your palette, edit the result, and download a print-ready PDF chart — your pet, your garden, your favourite photo, ready to stitch on Aida or linen.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: 'photo to cross stitch, cross stitch pattern maker, convert photo to cross stitch, DMC pattern generator, cross stitch PDF, counted cross stitch pattern, cross stitch chart maker, cross stitch from photo, DMC floss colors, cross stitch for beginners, Aida fabric cross stitch',
  alternates: { canonical: buildCanonicalUrl('/photo-to-cross-stitch') },
  robots: 'index, follow',
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

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Photo to Cross-Stitch Pattern Converter',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  description: DESCRIPTION,
  url: buildCanonicalUrl('/photo-to-cross-stitch'),
  featureList: [
    'Convert any JPEG, PNG or WebP photo to a cross-stitch pattern',
    'Choose stitch width and height independently',
    'Automatic DMC thread color matching from 454 colors',
    'Reduce palette to 10, 15, 20 or 25 colors',
    'Color preview and symbol grid views',
    'Download printable PDF with color grid, symbol grid and color key',
  ],
};

const FAQ = [
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
    q: 'Can I stitch this on linen or evenweave?',
    a: 'Absolutely. The pattern is just a grid of stitches — it works on any evenweave fabric. On 28-count linen stitched over two threads you get the same stitch size as 14-count Aida. On 32-count linen over two threads the result is the same as 16-count Aida.',
  },
  {
    q: 'How much DMC thread will I need?',
    a: 'The thread list in your PDF shows the stitch count for each color. As a rule of thumb, one skein of DMC floss (8 metres) covers roughly 250 cross stitches on 14-count Aida using 2 strands. Colors used in large areas will need more skeins; accent colors often need just one.',
  },
  {
    q: 'What needle size should I use?',
    a: 'A size 24 tapestry needle is standard for 14-count Aida with 2 strands of DMC floss. Use a size 26 for 16- or 18-count Aida, and a size 22 for 11-count Aida.',
  },
  {
    q: 'How long will this take to stitch?',
    a: 'It depends on the size and how densely the design fills the canvas. A 50×50 pattern typically takes 15–25 hours; an 80×80 pattern around 40–60 hours. Stitching a little each day, most people finish a medium-sized piece in a few weeks.',
  },
  {
    q: 'My photo has too many colors — which number should I pick?',
    a: 'Start with 10 or 15 colors. Fewer colors makes a cleaner, more graphic pattern that is quick to stitch and easy to buy thread for. You can re-import the same photo with a higher number any time to compare. For a detailed portrait, 20–30 colors gives a more realistic result.',
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
            Photo to Cross-Stitch Pattern Converter
          </h1>
          <p className="text-gray-600 mb-8 max-w-2xl">
            Turn any photo into a counted cross-stitch pattern with DMC thread colors.
            Choose your stitch size, adjust the palette, and download a print-ready PDF chart — your pet, your garden, your favourite photo, ready to stitch.
          </p>

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
                <li><span className="font-medium text-gray-800">Choose a simple subject.</span> A pet portrait, a single flower, a bird, or a landscape with a clear focal point converts much better than a busy group photo.</li>
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
                <li><span className="font-medium text-gray-800">Thread list.</span> Every DMC color used, with its number, color name, and stitch count — so you know exactly which threads to buy and how much of each you need.</li>
              </ul>
            </div>
          </section>

          <section className="mt-8 bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-sm text-gray-600">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Fabric and finished size guide</h2>
            <p className="mb-4">The size of your finished piece depends on how many stitches your pattern has and the count of your Aida fabric. Higher count = smaller stitches = finer detail. The most popular choice for beginners is 14-count Aida.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-700">
                    <th className="text-left py-2 pr-4 font-semibold">Pattern size</th>
                    <th className="text-left py-2 pr-4 font-semibold">14-count Aida</th>
                    <th className="text-left py-2 pr-4 font-semibold">16-count Aida</th>
                    <th className="text-left py-2 font-semibold">18-count Aida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr><td className="py-2 pr-4 font-medium text-gray-800">50 × 50 stitches</td><td className="py-2 pr-4">9 × 9 cm (3.6&Prime;)</td><td className="py-2 pr-4">8 × 8 cm (3.1&Prime;)</td><td className="py-2">7 × 7 cm (2.8&Prime;)</td></tr>
                  <tr><td className="py-2 pr-4 font-medium text-gray-800">80 × 80 stitches</td><td className="py-2 pr-4">14 × 14 cm (5.7&Prime;)</td><td className="py-2 pr-4">13 × 13 cm (5.0&Prime;)</td><td className="py-2">11 × 11 cm (4.4&Prime;)</td></tr>
                  <tr><td className="py-2 pr-4 font-medium text-gray-800">100 × 100 stitches</td><td className="py-2 pr-4">18 × 18 cm (7.1&Prime;)</td><td className="py-2 pr-4">16 × 16 cm (6.3&Prime;)</td><td className="py-2">14 × 14 cm (5.6&Prime;)</td></tr>
                  <tr><td className="py-2 pr-4 font-medium text-gray-800">120 × 120 stitches</td><td className="py-2 pr-4">22 × 22 cm (8.6&Prime;)</td><td className="py-2 pr-4">19 × 19 cm (7.5&Prime;)</td><td className="py-2">17 × 17 cm (6.7&Prime;)</td></tr>
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
              <li className="flex gap-3"><span className="flex-none w-6 h-6 rounded-full bg-rose-100 text-rose-700 text-xs font-bold flex items-center justify-center">6</span><span><span className="font-medium text-gray-800">Stitch one color at a time.</span> Work through all the stitches of one color before moving to the next. It is faster, uses less thread, and keeps the back of your work tidy.</span></li>
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
