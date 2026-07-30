import type { Metadata } from 'next';
import Link from 'next/link';
import { DesignListWrapper } from '@/app/components/DesignListWrapper';
import EditorCTAButton from '@/app/components/EditorCTAButton';
import { buildCanonicalUrl } from '@/lib/url-helper';
import { fetchFilteredDesigns } from '@/lib/data-access';

export const dynamic = 'force-dynamic';

const PAGE_PATH = '/easy-cross-stitch-patterns-for-beginners';
const TITLE = 'Easy Cross-Stitch Patterns for Beginners — Free PDF Charts';
const DESCRIPTION =
  'Free easy cross-stitch patterns for beginners: 5 colors or fewer, 60×60 stitches or smaller. Simple, forgiving projects to learn on, with instant free PDF download.';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const resolvedSearchParams = await searchParams;
  const nPage = parseInt(resolvedSearchParams?.nPage?.toString() || '1', 10);
  const canonicalUrl = buildCanonicalUrl(PAGE_PATH);
  const title = nPage > 1 ? `${TITLE} (Page ${nPage})` : TITLE;

  return {
    title,
    description: DESCRIPTION,
    keywords:
      'easy cross stitch patterns, cross stitch for beginners, simple cross stitch patterns, beginner cross stitch charts, easy counted cross stitch, first cross stitch project, free easy cross stitch PDF',
    alternates: { canonical: canonicalUrl },
    robots: 'index, follow',
    openGraph: { title, description: DESCRIPTION, url: canonicalUrl, type: 'website' },
    twitter: { card: 'summary_large_image', title, description: DESCRIPTION },
  };
}

export default async function EasyPatternsForBeginnersPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const nPage = parseInt(resolvedSearchParams?.nPage?.toString() || '1', 10);
  const pageSize = parseInt(resolvedSearchParams?.pageSize?.toString() || '24', 10);

  let designs: Awaited<ReturnType<typeof fetchFilteredDesigns>>['designs'] = [];
  let totalPages = 0;
  let entryCount = 0;
  try {
    ({ designs, totalPages, entryCount } = await fetchFilteredDesigns({
      widthFrom: 0,
      widthTo: 10000,
      heightFrom: 0,
      heightTo: 10000,
      ncolorsFrom: 0,
      ncolorsTo: 10000,
      nPage,
      pageSize,
      isBeginnerFriendly: true,
    }));
  } catch (error) {
    console.error('Error fetching beginner-friendly cross-stitch patterns:', error);
  }

  const canonicalUrl = buildCanonicalUrl(PAGE_PATH);
  const collectionStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: TITLE,
    description: DESCRIPTION,
    url: canonicalUrl,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionStructuredData) }} />
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-bold mb-2">Easy Cross-Stitch Patterns for Beginners ({entryCount} designs)</h1>
        <p className="text-gray-700 mb-4">
          &quot;Beginner-friendly&quot; here means 5 DMC thread colors or fewer and 60×60 stitches or smaller — few
          color changes to keep track of, and a project that finishes without feeling endless. Every chart below is
          a free, print-ready PDF.{' '}
          <Link href="/CrossStitchTips.aspx" className="text-blue-600 hover:underline">
            New to cross-stitch? See our beginner tips
          </Link>
          .
        </p>

        <div className="flex items-center justify-between gap-4 bg-rose-50 border border-rose-100 rounded-xl px-5 py-4 mb-6">
          <p className="text-sm text-gray-700 font-medium">Have your own photo? Turn it into an easy pattern with fewer colors.</p>
          <EditorCTAButton
            href="/photo-to-cross-stitch?source=beginner_patterns_page"
            label="Try the editor →"
            eventName="beginner_patterns_editor_cta_clicked"
            eventParams={{ source: 'beginner_patterns_page' }}
            className="shrink-0 px-4 py-2 bg-rose-600 text-white text-sm font-medium rounded-lg hover:bg-rose-700 transition-colors whitespace-nowrap"
          />
        </div>

        <DesignListWrapper
          designs={designs}
          page={nPage}
          totalPages={totalPages}
          pageSize={pageSize}
          caption="Easy Cross-Stitch Patterns for Beginners"
          baseUrl={PAGE_PATH}
        />

        <p className="mt-8 text-sm text-gray-600">
          Want something even quicker? See{' '}
          <Link href="/small-cross-stitch-patterns" className="text-blue-600 hover:underline">
            small cross-stitch patterns
          </Link>{' '}
          or browse{' '}
          <Link href="/XStitch-Charts.aspx" className="text-blue-600 hover:underline">
            all free cross-stitch albums
          </Link>
          .
        </p>
      </div>
    </>
  );
}
