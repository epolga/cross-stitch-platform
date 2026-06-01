import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import DesignPage, { generateMetadata as generateDesignMetadata } from '../designs/[designId]/page'; // Adjust path if needed
import AlbumDesignsPage, { generateMetadata as generateAlbumMetadata } from '../albums/[albumId]/page'; // Adjust path if needed
import AlbumsPage from '../albums/page'; // Adjust path if needed
import { getAlbumIdByCaption, getDesignIdByAlbumAndPage, updateLastEmailEntryByCid } from '@/lib/data-access'; // Adjust path if needed
import { sendEmailToAdmin } from '@/lib/email-service'; // Import the email service
import { updateLastEmailEntryInUsersTable } from '@/lib/users';
import { headers } from 'next/headers';
import { buildCanonicalUrl, getSiteBaseUrl, normalizeBaseUrl } from '@/lib/url-helper';

// Helper to parse slug (e.g., 'lion-37-114-Free-Design.aspx')
function parseSlugForDesign(slug: string): { caption: string; albumId: number; nPage: number } | null {
  const parts = slug.split('-');
  if (parts.length < 4 || parts[parts.length - 2].toLowerCase() !== 'free' || parts[parts.length - 1].toLowerCase() !== 'design.aspx') {
    return null;
  }
  const nPage = parseInt(parts[parts.length - 3], 10);
  const albumId = parseInt(parts[parts.length - 4], 10);
  const caption = parts.slice(0, parts.length - 4).join('-');
  if (isNaN(albumId) || isNaN(nPage)) {
    return null;
  }
  return { caption, albumId, nPage };
}
// Helper to parse album caption from slug (e.g., 'nature-45-Charts.aspx')
async function getAlbumCaptionFromSlug(slug: string): Promise<string | null> {
 const parts = slug.split('-');
 if (parts.length < 3 || parts[0].toLowerCase() !== 'free' || parts[parts.length - 1].toLowerCase() !== 'charts.aspx') {
    return null;
  }
  const albumCaption = parts.slice(1, parts.length - 1).join(' ');
  return albumCaption;
}

// Function to map parsed slug to designID using albumID and nPage
async function getDesignIdFromSlug(slug: string): Promise<string | null> {
  const parsed = parseSlugForDesign(slug);
  if (!parsed) {
    return null;
  }

  const designId = await getDesignIdByAlbumAndPage(parsed.albumId, parsed.nPage);
  return designId !== null ? designId.toString() : null;
}

async function GetDesignPageFromSlug(slug: string) {
  const designId = await getDesignIdFromSlug(slug);

    if (!designId) {
      notFound();
    }

    // Render the imported DesignPage component, passing simulated params

    return <DesignPage params={Promise.resolve({ designId: designId })} />;
 }

 async function GetAlbumsPageFromSlug() {
    return <AlbumsPage />;
 }

async function GetAlbumDesignsPageFromSlug(slug: string, searchParams: Record<string, string | string[] | undefined>) {
  const albumCaption = await getAlbumCaptionFromSlug(slug);

      if (!albumCaption) {
        notFound();
      }

      const albumId = await getAlbumIdByCaption(albumCaption);
      console.log("albumId received:", albumId);

      if (albumId === null) {
        notFound();
      }

      // Render the imported AlbumDesignsPage component, passing simulated params
      return <AlbumDesignsPage params={Promise.resolve({ albumId: albumId.toString() })} searchParams={Promise.resolve(searchParams)} />;
}

function resolveBaseUrl(headersList: Headers): string {
  const host = headersList.get('host');
  if (host) {
    const protocol =
      host.includes('localhost') || host.startsWith('127.')
        ? 'http'
        : headersList.get('x-forwarded-proto') || 'https';
    return normalizeBaseUrl(`${protocol}://${host}`);
  }
  return getSiteBaseUrl();
}

function buildFullRequestUrl(
  baseUrl: string,
  slug: string,
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const url = new URL(`/${slug}`, baseUrl);
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item) url.searchParams.append(key, item);
      });
    } else if (value) {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

export async function generateMetadata({ params, searchParams }: { 
  params: Promise<{ slug: string }>; 
  searchParams: Promise<Record<string, string | string[] | undefined>>; 
}): Promise<Metadata> {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  if(resolvedParams.slug.toLowerCase().endsWith('-free-design.aspx')) {
    const designId = await getDesignIdFromSlug(resolvedParams.slug);
    if (designId) {
      return generateDesignMetadata({ params: Promise.resolve({ designId }) });
    }
  } else if(resolvedParams.slug.toLowerCase() === 'xstitch-charts.aspx'){
    // Add metadata for albums page if needed
    const canonicalUrl = buildCanonicalUrl('/XStitch-Charts.aspx');
    return {
      title: 'Free Cross-Stitch Pattern Albums | Downloadable PDF Chart Catalog',
      description: 'Browse themed cross-stitch albums with full PDF charts, stitch counts, and color keys. Instant downloads for every album.',
      alternates: {
        canonical: canonicalUrl,
      },
    };
  } else if (resolvedParams.slug.toLowerCase().endsWith('-charts.aspx')) {
    const albumCaption = await getAlbumCaptionFromSlug(resolvedParams.slug);
    if (albumCaption) {
      const albumId = await getAlbumIdByCaption(albumCaption);
      if (albumId) {
        return generateAlbumMetadata({ params: Promise.resolve({ albumId: albumId.toString() }), searchParams: Promise.resolve(resolvedSearchParams) });
      }
    }
  }

  // Default metadata
  return {
    title: 'Page Not Found',
    description: 'The requested page could not be found',
  };
}

export default async function SlugPage({ params, searchParams }: { 
  params: Promise<{ slug: string }>; 
  searchParams: Promise<Record<string, string | string[] | undefined>>; 
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  // Check for eid and cid in searchParams and send notification email if present
  const eid = typeof resolvedSearchParams.eid === 'string' ? resolvedSearchParams.eid : Array.isArray(resolvedSearchParams.eid) ? resolvedSearchParams.eid[0] : undefined;
  const cid = typeof resolvedSearchParams.cid === 'string' ? resolvedSearchParams.cid : Array.isArray(resolvedSearchParams.cid) ? resolvedSearchParams.cid[0] : undefined;

  console.log(`Accessed slug: ${resolvedParams.slug} with eid: ${eid} and cid: ${cid}`);
  if (eid && cid) {
    const headersList = await headers();
    const ip = headersList.get('x-forwarded-for')?.split(',')[0].trim() || headersList.get('x-real-ip') || 'unknown';
    const baseUrl = resolveBaseUrl(headersList);
    const fullUrl = buildFullRequestUrl(baseUrl, resolvedParams.slug, resolvedSearchParams);

    const subject = 'Notification: Access from Email';
    const body = `A user accessed the page from an email link:\n- URL: ${fullUrl}\n- eid: ${eid}\n- cid: ${cid}\n- IP Address: ${ip}`;
    try {
      await Promise.all([
        updateLastEmailEntryByCid(cid),
        updateLastEmailEntryInUsersTable(cid),
      ]);
      await sendEmailToAdmin(subject, body, false); // Send as plain text
      console.log('Notification email sent to admin successfully.');
    } catch (error) {
      console.error('Failed to send notification email to admin:', error);
    }
  }

  if(resolvedParams.slug.toLowerCase().endsWith('-free-design.aspx')) {
    return GetDesignPageFromSlug(resolvedParams.slug);
    } else if(resolvedParams.slug.toLowerCase() === 'xstitch-charts.aspx'){
    return GetAlbumsPageFromSlug();
}     else if (resolvedParams.slug.toLowerCase().endsWith('-charts.aspx')) {
    return GetAlbumDesignsPageFromSlug(resolvedParams.slug, resolvedSearchParams);
  } else {
    notFound();
  }
}
