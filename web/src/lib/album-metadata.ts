import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { DesignsResponse } from '@/app/types/design';
import { buildCanonicalUrl, CreateAlbumUrl } from '@/lib/url-helper';
import { getAlbumCaption, getDesignsByAlbumId } from '@/lib/data-access';

export interface AlbumMetadataProps {
  params: Promise<{ albumId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// `viaSlug` true only when called on behalf of the pretty-slug route
// (`[slug]/page.tsx`, e.g. /Free-India-Charts.aspx), which is what
// canonicalPath below points to whenever an album has a caption. The real
// `generateMetadata` in `albums/[albumId]/page.tsx` (the one Next.js itself
// calls for the numeric /albums/[albumId] route) always passes false — a
// caption/canonical always exists by the time that route doesn't
// notFound(), so the numeric path is never itself the canonical form and
// should always noindex. This lives outside any page.tsx because Next's
// generated route types forbid extra named exports from a page file.
export async function buildAlbumMetadata({ params, searchParams }: AlbumMetadataProps, viaSlug: boolean): Promise<Metadata> {
  const { albumId } = await params;
  const searchParamsRes = await searchParams;
  const pageSize = parseInt(searchParamsRes.pageSize as string || '10');
  const page = parseInt(searchParamsRes.nPage as string || '1');

  if (!(await getAlbumCaption(parseInt(albumId)))) {
    notFound();
  }

  let designsResponse: DesignsResponse;
  try {
    designsResponse = await getDesignsByAlbumId(albumId, pageSize, page);
  } catch (error) {
    console.error('Error fetching designs for metadata:', error);
    return {
      title: `Free Designs in Album ${albumId}`,
      description: `Explore free cross-stitch designs in album ${albumId}`,
    };
  }

  const { albumCaption, designs } = designsResponse;
  const ogImage = designs[0]?.ImageUrl || 'https://d2o1uvvg91z7o4.cloudfront.net/images/default.jpg';
  const canonicalPath = albumCaption ? await CreateAlbumUrl(albumCaption) : `/albums/${albumId}`;
  const canonicalUrl = buildCanonicalUrl(canonicalPath);
  const baseName = albumCaption || `Album ${albumId}`;
  // The "Free" theme (independence/liberation designs) reads as "free of charge" when
  // dropped into the standard "{name} Cross-Stitch Patterns" template, colliding with the
  // homepage's own "Free Cross-Stitch PDF Patterns" title/intent for the same search terms.
  const isFreeThemeAlbum = (albumCaption || '').trim().toLowerCase() === 'free';
  const displayName = isFreeThemeAlbum ? '"Free" Theme' : baseName;
  const highlightNames = (designs || []).slice(0, 2).map((d) => d.Caption).filter(Boolean);
  const isBookmarksAlbum = (albumCaption || '').toLowerCase() === 'bookmarks';
  const title = `${displayName} Cross-Stitch Patterns (Album ${albumId}${page > 1 ? `, Page ${page}` : ''})`;
  const highlights = highlightNames.length ? ` Highlights: ${highlightNames.join(' | ')}.` : '';
  const bookmarkNote = isBookmarksAlbum ? ' Includes free cross-stitch bookmark patterns with slim, ready-to-print PDF charts.' : '';
  const description = `Explore free cross-stitch designs in the ${displayName} collection (Album ${albumId})${page > 1 ? ` on page ${page}` : ''}. Downloadable PDF patterns available.${highlights}${bookmarkNote}`;
  const slugCaption = baseName.replace(/\s+/g, '-');
  const keywords = albumCaption
    ? (isFreeThemeAlbum
        ? `independence themed cross stitch patterns, liberation cross stitch charts, free embroidery PDFs, ${slugCaption}-theme designs, album ${albumId}`
        : `free cross stitch ${albumCaption} patterns, ${albumCaption} charts, free embroidery PDFs, ${slugCaption} designs, download ${albumCaption} charts, album ${albumId}`)
    : `cross stitch, free designs, free patterns, PDFs, album ${albumId}, download album ${albumId} charts`;
  const hasPart = (designs || []).slice(0, 3).map((design) => ({
    "@type": "CreativeWork",
    "name": design.Caption,
    "description": design.Description || undefined,
  }));

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: canonicalUrl,
    },
    // General rule (replaces the old `page > 1` check, which kept missing
    // cases GSC flagged as "Duplicate without user-selected canonical" —
    // pageSize=10&nPage=1, the numeric /albums/[id] path itself, junk query
    // strings): index only the canonical form exactly — reached via the
    // pretty-slug route (see viaSlug above) with no search params at all.
    // Any params, or access via the numeric path, noindex. follow (not
    // nofollow) so Googlebot still discovers designs linked from later
    // pages via PaginationControl's real <a href> links.
    robots: (viaSlug && Object.keys(searchParamsRes).length === 0) ? 'index, follow' : 'noindex, follow',
    openGraph: {
      title,
      description,
      images: ogImage,
      url: canonicalUrl,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ogImage,
    },
    other: {
      'application/ld+json': JSON.stringify({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": title,
        "description": description,
        "image": ogImage,
        "url": canonicalUrl,
        "keywords": keywords,
        "hasPart": hasPart,
      }),
    },
  };
}
