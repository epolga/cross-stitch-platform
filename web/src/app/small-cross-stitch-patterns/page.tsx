import type { Metadata } from 'next';
import Link from 'next/link';
import { DesignListWrapper } from '@/app/components/DesignListWrapper';
import EditorCTAButton from '@/app/components/EditorCTAButton';
import { buildCanonicalUrl } from '@/lib/url-helper';
import { fetchFilteredDesigns } from '@/lib/data-access';

export const dynamic = 'force-dynamic';

const PAGE_PATH = '/small-cross-stitch-patterns';
const TITLE = 'Small Cross-Stitch Patterns — Free PDF Charts, 50 Stitches or Under';
const DESCRIPTION =
  'Browse free small cross-stitch patterns, 50 stitches or fewer on the longest side. Quick, satisfying projects with instant free PDF download — no account needed to browse.';

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
      'small cross stitch patterns, mini cross stitch patterns, quick cross stitch projects, small cross stitch charts, tiny cross stitch pattern, free small cross stitch PDF, small counted cross stitch',
    alternates: { canonical: canonicalUrl },
    robots: nPage > 1 ? 'noindex, follow' : 'index, follow',
    openGraph: { title, description: DESCRIPTION, url: canonicalUrl, type: 'website' },
    twitter: { card: 'summary_large_image', title, description: DESCRIPTION },
  };
}

export default async function SmallCrossStitchPatternsPage({ searchParams }: Props) {
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
      sizeCategory: 'small',
    }));
  } catch (error) {
    console.error('Error fetching small cross-stitch patterns:', error);
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
        <h1 className="text-3xl font-bold mb-2">Small Cross-Stitch Patterns ({entryCount} designs)</h1>
        <p className="text-gray-700 mb-4">
          &quot;Small&quot; here means 50 stitches or fewer on the longest side — quick, satisfying projects that finish in a
          sitting or two, whatever the subject. On 14-count Aida that&apos;s about 9×9 cm (3.6&Prime;) or smaller. Every
          chart below is a free, print-ready PDF.{' '}
          <Link href="/cross-stitch-size-calculator" className="text-blue-600 hover:underline">
            Check the finished size for any stitch count
          </Link>
          .
        </p>

        <div className="flex items-center justify-between gap-4 bg-rose-50 border border-rose-100 rounded-xl px-5 py-4 mb-6">
          <p className="text-sm text-gray-700 font-medium">Have your own photo? Turn it into a small pattern of your own.</p>
          <EditorCTAButton
            href="/photo-to-cross-stitch?source=small_patterns_page"
            label="Try the editor →"
            eventName="small_patterns_editor_cta_clicked"
            eventParams={{ source: 'small_patterns_page' }}
            className="shrink-0 px-4 py-2 bg-rose-600 text-white text-sm font-medium rounded-lg hover:bg-rose-700 transition-colors whitespace-nowrap"
          />
        </div>

        <DesignListWrapper
          designs={designs}
          page={nPage}
          totalPages={totalPages}
          pageSize={pageSize}
          caption="Small Cross-Stitch Patterns"
          baseUrl={PAGE_PATH}
        />

        <p className="mt-8 text-sm text-gray-600">
          New to stitching? See{' '}
          <Link href="/easy-cross-stitch-patterns-for-beginners" className="text-blue-600 hover:underline">
            easy patterns for beginners
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
