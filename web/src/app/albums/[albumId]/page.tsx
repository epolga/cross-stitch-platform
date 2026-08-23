import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DesignList } from '@/app/components/DesignList'; // Adjust path
import type { DesignsResponse } from '@/app/types/design';
import { buildCanonicalUrl, CreateAlbumUrl } from '@/lib/url-helper';
import { isPaidDownloadMode } from '@/lib/download-mode';
import { getAdjacentAlbums, getAlbumCaption, getDesignsByAlbumId } from '@/lib/data-access';
import { buildAlbumMetadata, type AlbumMetadataProps } from '@/lib/album-metadata';
import Link from 'next/link';
import AdSlot from '@/app/components/AdSlot';
import EditorCTAButton from '@/app/components/EditorCTAButton';

export const dynamic = 'force-dynamic';

type Props = AlbumMetadataProps;

// Next.js itself only ever calls this for the numeric /albums/[albumId]
// route, so viaSlug is always false here — see buildAlbumMetadata for why
// that means this route always noindexes. The pretty-slug route
// (`[slug]/page.tsx`) calls buildAlbumMetadata directly with viaSlug=true.
export async function generateMetadata(props: Props): Promise<Metadata> {
  return buildAlbumMetadata(props, false);
}

export default async function AlbumDesignsPage({ params, searchParams }: Props) {
  const { albumId } = await params;
  const searchParamsRes = await searchParams;
  const pageSize = parseInt(searchParamsRes.pageSize as string || '10');
  const page = parseInt(searchParamsRes.nPage as string || '1');
  const adsEnabled = !isPaidDownloadMode();
  const adSlotTop =
    process.env.NEXT_PUBLIC_AD_SLOT_ALBUMS_TOP ??
    process.env.NEXT_PUBLIC_AD_SLOT_DESIGN_TOP ??
    '';
  const adSlotBottom =
    process.env.NEXT_PUBLIC_AD_SLOT_ALBUMS_BOTTOM ??
    process.env.NEXT_PUBLIC_AD_SLOT_DESIGN_BOTTOM ??
    '';

  if (!(await getAlbumCaption(parseInt(albumId)))) {
    notFound();
  }

  let designsResponse: DesignsResponse;
  try {
    designsResponse = await getDesignsByAlbumId(albumId, pageSize, page);
  } catch (error) {
    console.error('Error fetching designs for album:', error);
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-bold mb-6">Designs in Album {albumId}</h1>
        <p className="text-red-500">
          Error loading designs: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  const { designs, entryCount, page: currentPage, totalPages, albumCaption, albumSeoDescription } = designsResponse;
  const baseUrl = albumCaption ? await CreateAlbumUrl(albumCaption) : `/albums/${albumId}`;
  const isBookmarksAlbum = (albumCaption || '').toLowerCase() === 'bookmarks';
  const isFreeThemeAlbum = (albumCaption || '').trim().toLowerCase() === 'free';
  const h1DisplayName = isFreeThemeAlbum ? '"Free" Theme' : (albumCaption || `Album ${albumId}`);
  const nav = await getAdjacentAlbums(parseInt(albumId));

  const breadcrumbStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: buildCanonicalUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'All Albums', item: buildCanonicalUrl('/XStitch-Charts.aspx') },
      {
        '@type': 'ListItem',
        position: 3,
        name: albumCaption || `Album ${albumId}`,
        item: buildCanonicalUrl(baseUrl),
      },
    ],
  };

  return (
    <div className="container mx-auto p-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbStructuredData) }} />
      <h1 className="text-3xl font-bold mb-6">Designs in {h1DisplayName} ({entryCount} designs)</h1>
      {albumSeoDescription ? (
        <div className="text-gray-600 text-sm mb-4">
          {albumSeoDescription.split('\n').filter(p => p.trim()).map((para, i) => (
            <p key={i} className="mb-2">{para.trim()}</p>
          ))}
          <p className="mt-1">
            Looking for more ideas? <Link href="/XStitch-Charts.aspx" className="text-blue-600 hover:underline">View all free cross-stitch albums</Link>.
          </p>
        </div>
      ) : (
        <p className="text-gray-700 mb-4">
          This curated collection of free PDF charts includes instant downloads and stitch details tailored to the {albumCaption || `album ${albumId}`} theme.
          Looking for more ideas? <Link href="/XStitch-Charts.aspx" className="text-blue-600 hover:underline">View all free cross-stitch albums</Link>.
        </p>
      )}
      {isBookmarksAlbum ? (
        <p className="text-gray-700 mb-4">
          Explore free cross-stitch bookmark patterns with slim, ready-to-print PDF charts—ideal for quick gifts and travel-friendly stitching.
        </p>
      ) : null}
      {adsEnabled && adSlotTop && (
        <div className="hidden md:block my-6">
          <AdSlot slot={adSlotTop} minHeight={250} minHeightDesktop={280} />
        </div>
      )}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-6 space-y-2">
        <h2 className="text-xl font-semibold text-gray-900">How to choose a chart</h2>
        <p className="text-sm text-gray-800">
          Pick stitch sizes that fit your fabric and frame, and watch the color count if you want a faster stitch or minimal floss purchases.
          Larger stitch counts and more shades add detail but take longer to finish.
        </p>
        <ul className="list-disc list-inside text-sm text-gray-800 space-y-1">
          <li>Match stitch count to your fabric to estimate the finished dimensions.</li>
          <li>Limit colors for quicker projects; choose richer palettes for detailed pieces.</li>
          <li>Open a design to view the PDF, color key, and notes before you start stitching.</li>
        </ul>
      </div>
      {nav && (
        <div className="flex items-stretch gap-3 mb-5">
          <Link
            href={nav.prev ? CreateAlbumUrl(nav.prev.Caption) : baseUrl}
            className="flex-1 flex flex-col items-start px-4 py-3 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <span className="text-2xl font-bold text-gray-500">←</span>
            <span className="text-sm font-semibold text-gray-700">Previous album</span>
            <span className="text-xs text-gray-400 truncate w-full mt-0.5">{nav.prev?.Caption ?? albumCaption}</span>
          </Link>
          <Link
            href="/XStitch-Charts.aspx"
            className="flex flex-col items-center justify-center px-4 py-3 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors text-center shrink-0"
          >
            <span className="text-2xl font-bold text-gray-500">↑</span>
            <span className="text-sm font-semibold text-gray-700">All albums</span>
          </Link>
          <Link
            href={nav.next ? CreateAlbumUrl(nav.next.Caption) : baseUrl}
            className="flex-1 flex flex-col items-end px-4 py-3 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors text-right"
          >
            <span className="text-2xl font-bold text-gray-500">→</span>
            <span className="text-sm font-semibold text-gray-700">Next album</span>
            <span className="text-xs text-gray-400 truncate w-full mt-0.5">{nav.next?.Caption ?? albumCaption}</span>
          </Link>
        </div>
      )}
      <div className="flex items-center justify-between gap-4 bg-rose-50 border border-rose-100 rounded-xl px-5 py-4 mb-6">
        <p className="text-sm text-gray-700 font-medium">Have your own photo? Turn it into a cross-stitch pattern.</p>
        <EditorCTAButton
          href={`/photo-to-cross-stitch?source=album_page&albumId=${albumId}`}
          label="Try the editor →"
          eventName="album_editor_cta_clicked"
          eventParams={{ albumId, source: 'album_page' }}
          className="shrink-0 px-4 py-2 bg-rose-600 text-white text-sm font-medium rounded-lg hover:bg-rose-700 transition-colors whitespace-nowrap"
        />
      </div>

      <DesignList
        designs={designs}
        page={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        caption={albumCaption || `Album ${albumId}`}
        baseUrl={`${baseUrl}`}
        isLoggedIn={false} // Assuming user is logged in for this example
      />
      {adsEnabled && adSlotBottom && (
        <div className="my-6">
          <AdSlot slot={adSlotBottom} minHeight={250} minHeightDesktop={280} />
        </div>
      )}
    </div>
  );
}
