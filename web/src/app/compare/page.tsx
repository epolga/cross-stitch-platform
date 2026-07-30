import type { Metadata } from 'next';
import Link from 'next/link';
import { buildCanonicalUrl } from '@/lib/url-helper';
import { comparisons } from '@/lib/compare-data';

const TITLE = 'Cross-Stitch.com vs Other Cross-Stitch Pattern Makers — Comparisons';
const DESCRIPTION =
  'Honest, fact-checked comparisons between Cross-Stitch.com and other cross-stitch pattern makers and converters — pricing, photo-to-pattern conversion, editing tools, and pattern catalogs.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: 'cross stitch pattern maker comparison, best cross stitch pattern maker, cross stitch software alternatives, cross stitch pattern maker reviews',
  alternates: { canonical: buildCanonicalUrl('/compare') },
  robots: 'index, follow',
  openGraph: { title: TITLE, description: DESCRIPTION, url: buildCanonicalUrl('/compare'), type: 'website' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

export default function ComparePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
          How does Cross-Stitch.com compare?
        </h1>
        <p className="text-gray-600 mb-4">
          Honest, fact-checked comparisons — including where the other tool
          genuinely does something better. Pricing and features are verified
          against each competitor&apos;s own site as of the date shown.
        </p>
        <p className="text-gray-600 mb-8">
          Prefer a quick summary of all of them first?{' '}
          <Link href="/best-cross-stitch-pattern-makers" className="text-rose-600 underline hover:text-rose-700">
            See the full best-of roundup
          </Link>.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {comparisons.map(c => (
            <Link
              key={c.slug}
              href={`/compare/${c.slug}`}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:border-rose-300 hover:shadow-md transition-all"
            >
              <p className="font-semibold text-gray-900">{c.competitorName} vs Cross-Stitch.com</p>
              <p className="text-sm text-gray-500 mt-1">Verified {c.verifiedDate}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
