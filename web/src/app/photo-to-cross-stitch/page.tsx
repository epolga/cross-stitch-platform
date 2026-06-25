import type { Metadata } from 'next';
import { buildCanonicalUrl } from '@/lib/url-helper';
import ConvertClient from './ConvertClient';

const TITLE = 'Free Photo to Cross-Stitch Pattern Converter';
const DESCRIPTION =
  'Turn any photo into a printable cross-stitch pattern in seconds. ' +
  'Choose your stitch count and number of DMC thread colors, then download a ready-to-stitch PDF chart — free, no account needed.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: 'photo to cross stitch, cross stitch pattern maker, convert photo to cross stitch, DMC pattern generator, cross stitch PDF',
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
    a: 'The converter maps every pixel to the nearest of 454 standard DMC floss colors using RGB distance, then reduces the palette to your chosen limit (10–25 colors) by merging the least-used shades into their closest neighbor.',
  },
  {
    q: 'What does the PDF include?',
    a: 'Three pages: a colored grid showing each stitch in its DMC color, a symbol grid for black-and-white printing, and a color key table listing the symbol, DMC number, color name and stitch count for every thread.',
  },
  {
    q: 'Is this tool free?',
    a: 'Yes — the converter is completely free with no account required.',
  },
];

export default function PhotoToCrossStitchPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-6 py-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Free Photo to Cross-Stitch Pattern Converter
          </h1>
          <p className="text-gray-600 mb-8 max-w-2xl">
            Upload any photo and convert it instantly to a stitchable cross-stitch pattern
            with DMC thread colors. Set your own stitch dimensions, limit the palette, preview
            the result in your browser, and download a print-ready PDF chart — free, no account needed.
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

          <section className="mt-8 prose max-w-none text-sm text-gray-600">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">
              How the converter works
            </h2>
            <p>
              When you upload a photo, it is resized to your chosen stitch grid using high-quality
              resampling. Each pixel is then matched to the nearest of 454 standard DMC embroidery
              floss colors by calculating the Euclidean distance in RGB color space. If your chosen
              palette limit is lower than the initial color count, the rarest colors are merged into
              their closest neighbors until the target is reached.
            </p>
            <p className="mt-2">
              The resulting pattern is rendered in your browser as a canvas — switch between the
              colored view to check overall appearance and the symbol view to see the printable
              black-and-white chart. When you are happy with the result, download the PDF to get
              all three pages ready for printing.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
