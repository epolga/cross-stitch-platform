import type { Metadata } from 'next';
import Link from 'next/link';
import { buildCanonicalUrl } from '@/lib/url-helper';
import dmcColors from '@/data/dmc-colors.json';
import DmcColorChartClient from './DmcColorChartClient';

const TITLE = 'DMC Color Chart — All 452 DMC Thread Colors';
const DESCRIPTION =
  'Browse and search all 452 DMC embroidery floss colors with swatches, names, and hex codes. ' +
  'Used automatically by our free photo-to-cross-stitch pattern maker to match your photo to real DMC thread.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords:
    'dmc color chart, dmc thread colors, dmc floss colors, dmc color list, dmc number chart, cross stitch thread colors, embroidery floss colors',
  alternates: { canonical: buildCanonicalUrl('/dmc-color-chart') },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: buildCanonicalUrl('/dmc-color-chart'),
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

const FAQ = [
  {
    q: 'How many DMC colors are there?',
    a: `This chart lists all ${dmcColors.length} standard DMC stranded cotton floss colors, including white, ecru, and the full numbered range.`,
  },
  {
    q: 'What do DMC numbers mean?',
    a: 'Each DMC number identifies one specific shade of embroidery floss, so pattern designers and stitchers can refer to the exact same color regardless of language or region — "DMC 310" is always the same black, everywhere.',
  },
  {
    q: 'Can I use this chart to convert a photo into a pattern automatically?',
    a: 'Yes. Our free photo-to-cross-stitch pattern maker matches every part of your photo to the closest color on this exact DMC list, so you do not have to pick colors by hand.',
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

export default function DmcColorChartPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-6 py-8 max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            DMC Color Chart — All {dmcColors.length} DMC Thread Colors
          </h1>
          <p className="text-gray-600 mb-8">
            Every standard DMC stranded cotton color, with its number, name, and hex code. Search by number
            or name to find a specific shade, or browse the full range. This is the same color list our{' '}
            <Link href="/photo-to-cross-stitch" className="text-rose-600 underline hover:text-rose-700">
              free photo-to-cross-stitch pattern maker
            </Link>{' '}
            uses to match your photos automatically.
          </p>

          <DmcColorChartClient colors={dmcColors} />

          <section className="mt-12 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Frequently Asked Questions</h2>
            <dl className="space-y-5">
              {FAQ.map(({ q, a }) => (
                <div key={q}>
                  <dt className="font-semibold text-gray-800">{q}</dt>
                  <dd className="mt-1 text-gray-600 text-sm">{a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <p className="mt-8 text-sm text-gray-500 text-center">
            Have a stitch count in mind and need to know how big your finished piece will be?{' '}
            <Link href="/cross-stitch-size-calculator" className="text-rose-600 underline hover:text-rose-700">
              Try the cross-stitch size calculator
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
