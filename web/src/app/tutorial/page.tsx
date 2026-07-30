import type { Metadata } from 'next';
import Link from 'next/link';
import { buildCanonicalUrl } from '@/lib/url-helper';
import { tutorials, CATEGORY_ORDER } from '@/lib/tutorial-data';

const TITLE = 'How to Use the Cross-Stitch Pattern Editor — Full Guide';
const DESCRIPTION =
  'Step-by-step guides to every part of the Cross-Stitch.com pattern editor — converting a photo, drawing tools, colors, Stitch Mode progress tracking, exporting, and sharing.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: 'cross stitch editor tutorial, how to use cross stitch pattern maker, cross stitch editor guide, photo to cross stitch tutorial',
  alternates: { canonical: buildCanonicalUrl('/tutorial') },
  robots: 'index, follow',
  openGraph: { title: TITLE, description: DESCRIPTION, url: buildCanonicalUrl('/tutorial'), type: 'website' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

export default function TutorialIndexPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">{TITLE}</h1>
        <p className="text-gray-600 mb-8">
          Everything the editor can do, one topic at a time. New here?{' '}
          <Link href="/tutorial/your-first-pattern" className="text-rose-600 underline hover:text-rose-700">
            Start with Your First Pattern
          </Link>.
        </p>

        {CATEGORY_ORDER.map(category => {
          const guides = tutorials.filter(t => t.category === category);
          if (guides.length === 0) return null;
          return (
            <section key={category} className="mb-8">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{category}</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {guides.map(g => (
                  <Link
                    key={g.slug}
                    href={`/tutorial/${g.slug}`}
                    className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:border-rose-300 hover:shadow-md transition-all"
                  >
                    <p className="font-semibold text-gray-900">{g.title}</p>
                    <p className="text-sm text-gray-500 mt-1">{g.intro}</p>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        <p className="text-sm text-gray-600 mt-4">
          Ready to try it? <Link href="/photo-to-cross-stitch" className="text-rose-600 underline hover:text-rose-700">Open the editor</Link>.
        </p>
      </div>
    </div>
  );
}
