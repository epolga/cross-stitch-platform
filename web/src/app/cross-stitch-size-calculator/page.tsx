import type { Metadata } from 'next';
import Link from 'next/link';
import { buildCanonicalUrl } from '@/lib/url-helper';
import { stitchesToSize } from '@/lib/fabric-size';
import SizeCalculatorClient from './SizeCalculatorClient';

const TITLE = 'Cross-Stitch Size Calculator — Finished Size by Fabric Count';
const DESCRIPTION =
  'Calculate the finished size of a cross-stitch pattern from stitch count and Aida fabric count, in cm and inches. ' +
  'Free tool — no account needed.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords:
    'cross stitch size calculator, cross stitch fabric count calculator, aida fabric size calculator, how big will my cross stitch pattern be, cross stitch finished size',
  alternates: { canonical: buildCanonicalUrl('/cross-stitch-size-calculator') },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: buildCanonicalUrl('/cross-stitch-size-calculator'),
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

const EXAMPLE_COUNTS = [14, 16, 18];
const EXAMPLE_STITCHES = [50, 80, 100, 120];

const FAQ = [
  {
    q: 'How do I calculate the finished size of a cross-stitch pattern?',
    a: 'Divide the number of stitches by your fabric count (stitches per inch) to get the size in inches, then multiply by 2.54 for centimeters. For example, 100 stitches on 14-count Aida is 100 ÷ 14 = 7.1 inches (18.1 cm).',
  },
  {
    q: 'What fabric count should I use?',
    a: '14-count Aida is the most common choice for beginners — the holes are easy to see and it works with 2 strands of DMC floss. Higher counts (16, 18, 22+) give smaller, finer stitches and a smaller finished piece for the same stitch count.',
  },
  {
    q: 'How much extra fabric should I cut?',
    a: 'Cut your fabric at least 5 cm (2″) larger than the finished size on every side, to leave a border for hooping, framing, or finishing.',
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

export default function SizeCalculatorPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-6 py-8 max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Cross-Stitch Size Calculator</h1>
          <p className="text-gray-600 mb-8">
            Enter your pattern&apos;s stitch count and fabric count to see exactly how big the finished piece
            will be, in centimeters and inches. Designing your own pattern?{' '}
            <Link href="/photo-to-cross-stitch" className="text-rose-600 underline hover:text-rose-700">
              Convert a photo or start from a blank canvas
            </Link>{' '}
            with our free pattern maker, matched to real{' '}
            <Link href="/dmc-color-chart" className="text-rose-600 underline hover:text-rose-700">
              DMC thread colors
            </Link>
            .
          </p>

          <SizeCalculatorClient />

          <section className="mt-8 bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-sm text-gray-600">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Common sizes at a glance</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-700">
                    <th className="text-left py-2 pr-4 font-semibold">Pattern size</th>
                    {EXAMPLE_COUNTS.map((c) => (
                      <th key={c} className="text-left py-2 pr-4 font-semibold">
                        {c}-count Aida
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {EXAMPLE_STITCHES.map((s) => (
                    <tr key={s}>
                      <td className="py-2 pr-4 font-medium text-gray-800">
                        {s} × {s} stitches
                      </td>
                      {EXAMPLE_COUNTS.map((c) => {
                        const size = stitchesToSize(s, c);
                        return (
                          <td key={c} className="py-2 pr-4">
                            {size.cm.toFixed(0)} × {size.cm.toFixed(0)} cm ({size.inches.toFixed(1)}
                            &Prime;)
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
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
        </div>
      </div>
    </>
  );
}
