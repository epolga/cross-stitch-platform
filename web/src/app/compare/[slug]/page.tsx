import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildCanonicalUrl } from '@/lib/url-helper';
import { comparisons, getComparison } from '@/lib/compare-data';

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return comparisons.map(c => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = getComparison(slug);
  if (!entry) return {};

  const title = `${entry.h1} (2026)`;
  return {
    title,
    description: entry.metaDescription,
    keywords: `${entry.competitorName} alternative, ${entry.competitorName} vs Cross-Stitch.com, ${entry.competitorName} review, best cross stitch pattern maker, free cross stitch pattern maker`,
    alternates: { canonical: buildCanonicalUrl(`/compare/${entry.slug}`) },
    robots: 'index, follow',
    openGraph: {
      title,
      description: entry.metaDescription,
      url: buildCanonicalUrl(`/compare/${entry.slug}`),
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: entry.metaDescription,
    },
  };
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;
  const entry = getComparison(slug);
  if (!entry) notFound();

  const faqStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entry.faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  const breadcrumbStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Comparisons', item: buildCanonicalUrl('/compare') },
      { '@type': 'ListItem', position: 2, name: `${entry.competitorName} vs Cross-Stitch.com`, item: buildCanonicalUrl(`/compare/${entry.slug}`) },
    ],
  };

  const otherComparisons = comparisons.filter(c => c.slug !== entry.slug);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbStructuredData) }}
      />
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <p className="text-xs text-gray-400 mb-2">
            <Link href="/compare" className="hover:text-rose-600 hover:underline">Comparisons</Link>
            {' / '}{entry.competitorName}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 leading-snug">
            {entry.h1}
          </h1>

          {/* The short version */}
          <section className="mb-8 grid gap-3 sm:grid-cols-2">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{entry.competitorName}</h2>
              <p className="text-sm text-gray-700 leading-relaxed">{entry.shortVersionThem}</p>
            </div>
            <div className="bg-white rounded-xl border-2 border-green-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-green-700 uppercase tracking-wide mb-2">Cross-Stitch.com</h2>
              <p className="text-sm text-gray-700 leading-relaxed">{entry.shortVersionUs}</p>
            </div>
          </section>

          {/* Feature comparison table */}
          <section className="mb-8 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Feature comparison</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-700">
                    <th className="text-left py-2 pr-4 font-semibold"> </th>
                    <th className="text-left py-2 pr-4 font-semibold">{entry.competitorName}</th>
                    <th className="text-left py-2 pr-4 font-semibold">Cross-Stitch.com</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entry.tableRows.map(row => (
                    <tr key={row.label}>
                      <td className="py-2.5 pr-4 font-medium text-gray-800 align-top">{row.label}</td>
                      <td className="py-2.5 pr-4 text-gray-600 align-top">{row.them}</td>
                      <td className={`py-2.5 pr-4 align-top ${row.usWins ? 'text-green-700 font-medium' : 'text-gray-600'}`}>{row.us}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Where they win */}
          <section className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Where {entry.competitorName} wins</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{entry.whereTheyWin}</p>
          </section>

          {/* Where we differ */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Where Cross-Stitch.com is different</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{entry.whereWeDiffer}</p>
          </section>

          {/* Bottom line */}
          <section className="mb-10 bg-green-50 border border-green-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Bottom line</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">{entry.bottomLine}</p>
            <Link
              href="/photo-to-cross-stitch"
              className="inline-block bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              Try the free converter →
            </Link>
          </section>

          {/* FAQ */}
          <section className="mb-10 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">Frequently asked questions</h2>
            <dl className="space-y-4">
              {entry.faq.map(({ q, a }) => (
                <div key={q}>
                  <dt className="font-semibold text-gray-800 text-sm">{q}</dt>
                  <dd className="mt-1 text-gray-600 text-sm leading-relaxed">{a}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Other comparisons */}
          {otherComparisons.length > 0 && (
            <section className="mb-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Other comparisons</h2>
              <div className="flex flex-wrap gap-2">
                {otherComparisons.map(c => (
                  <Link
                    key={c.slug}
                    href={`/compare/${c.slug}`}
                    className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 hover:border-rose-300 hover:text-rose-600 transition-colors"
                  >
                    {c.competitorName} vs Cross-Stitch.com
                  </Link>
                ))}
              </div>
            </section>
          )}

          <p className="text-xs text-gray-400 mt-8">
            Facts about {entry.competitorName} last verified {entry.verifiedDate} against their own site.
            {entry.sourcesNote ? ` ${entry.sourcesNote}` : ''} Pricing and features change — if
            something here looks out of date,{' '}
            <a href="mailto:ann@cross-stitch.com" className="underline hover:text-gray-600">let us know</a>.
          </p>
        </div>
      </div>
    </>
  );
}
