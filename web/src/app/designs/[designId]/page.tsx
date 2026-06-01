import Image from 'next/image';
import Link from 'next/link';
import type { Design } from '@/app/types/design';
import type { Metadata } from 'next';
import { buildCanonicalUrl, CreateAlbumUrl, CreateDesignUrl, getSiteBaseUrl } from '@/lib/url-helper';
import { isPaidDownloadMode } from '@/lib/download-mode';
import { getAdjacentDesigns } from '@/lib/data-access';
import { DesignDownloadControls } from './DesignDownloadControls';
import AdSlot from '@/app/components/AdSlot';
import PinterestSaveLink from '@/app/components/PinterestSaveLink';
import DesignLikeButton from '@/app/components/DesignLikeButton';
import { getDesignById } from '@/lib/data-access';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const DEFAULT_OG_IMAGE = 'https://d2o1uvvg91z7o4.cloudfront.net/images/default.jpg';

interface Props {
  params: Promise<{ designId: string }>;
}

function toAbsoluteUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    return new URL(url).toString();
  } catch {
    return new URL(url.startsWith('/') ? url : `/${url}`, `${getSiteBaseUrl()}/`).toString();
  }
}

function buildPinterestShareUrl(pageUrl: string, imageUrl: string | null, description: string): string {
  const shareUrl = new URL('https://www.pinterest.com/pin/create/button/');
  shareUrl.searchParams.set('url', pageUrl);
  shareUrl.searchParams.set('description', description);

  if (imageUrl) {
    shareUrl.searchParams.set('media', imageUrl);
  }

  return shareUrl.toString();
}

function buildPinterestPinUrl(pinId: string): string {
  return `https://www.pinterest.com/pin/${encodeURIComponent(pinId)}/`;
}

async function getMissingDesigns(): Promise<Set<number>> {
  try {
    const filePath = path.join(process.cwd(), 'MissingDesignPdfs.txt');
    const content = await fs.readFile(filePath, 'utf-8');
    const set = new Set<number>();
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const [idStr] = line.split(',');
        const id = parseInt(idStr, 10);
        if (!Number.isNaN(id)) set.add(id);
      });
    return set;
  } catch (error) {
    console.error('[design page] Failed to read MissingDesignPdfs.txt', error);
    return new Set<number>();
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { designId } = await params;
console.log("Generating metadata for designId:", designId);
  let design: Design;
  try {
    const id = parseInt(designId, 10);
    const result = await getDesignById(id);
    if (!result) throw new Error(`Design ${designId} not found`);
    design = result;
  } catch (error) {
    console.error('Error fetching design for metadata:', error);
    return {
      title: 'Design Not Found',
      description: 'Error loading design',
    };
  }

  const canonicalUrl = buildCanonicalUrl(await CreateDesignUrl(design));
  const ogImage = toAbsoluteUrl(design.ImageUrl) || DEFAULT_OG_IMAGE;

  const featureParts = [
    design.Width && design.Height ? `${design.Width}x${design.Height} stitches` : null,
    design.NColors ? `${design.NColors} colors` : null,
    design.NDownloaded ? `${design.NDownloaded} downloads` : null,
  ].filter(Boolean);

  const baseTitle = `${design.Caption} (Design ${designId}) - Free Cross-Stitch Pattern`;
  const description = design.Description
    ? `${design.Description} (Design ${designId}${featureParts.length ? ` · ${featureParts.join(' · ')}` : ''})`
    : `Free cross-stitch pattern ${design.Caption} (Design ${designId})${featureParts.length ? ` with ${featureParts.join(' · ')}` : ''}.`;
  const captionSlug = design.Caption.replace(/\s+/g, '-');
  const keywords = [
    'cross stitch',
    'free design',
    'free pattern',
    'PDF',
    'embroidery chart',
    design.Caption,
    `${design.Caption} pattern`,
    `${captionSlug} cross stitch`,
    `${design.Caption} download`,
    `download ${design.Caption} pattern`,
  ].join(', ');

  return {
    title: baseTitle,
    description,
    keywords,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: 'index, follow',
    openGraph: {
      title: baseTitle,
      description,
      images: ogImage,
      url: canonicalUrl,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: baseTitle,
      description,
      images: ogImage,
    },
    other: {
      'application/ld+json': JSON.stringify({
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        "name": baseTitle,
        "description": description,
        "image": ogImage,
        "url": canonicalUrl,
        "keywords": "cross stitch, free pattern, design",
        "isAccessibleForFree": true,
        "inLanguage": "en",
        "author": {
          "@type": "Person",
          "name": "Ann"
        }
      }),
    },
  };
}

export default async function DesignPage({ params }: Props) {
  const { designId } = await params;
  const adsEnabled = !isPaidDownloadMode();
  const adSlotTop = process.env.NEXT_PUBLIC_AD_SLOT_DESIGN_TOP ?? '';
  const adSlotBottom = process.env.NEXT_PUBLIC_AD_SLOT_DESIGN_BOTTOM ?? '';

  let design: Design;
  try {
    const id = parseInt(designId, 10);
    const result = await getDesignById(id);
    if (!result) throw new Error(`Design ${designId} not found`);
    design = result;
  } catch (error) {
    console.error('Error fetching design:', error);
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-bold mb-6">Design Not Found</h1>
        <p className="text-red-500">
          Error loading design: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  const missingDesigns = await getMissingDesigns();
  const isMissing = missingDesigns.has(design.DesignID);

  const nav = await getAdjacentDesigns(design.DesignID);
  const albumUrl = nav?.albumCaption
    ? CreateAlbumUrl(nav.albumCaption)
    : nav ? `/albums/${nav.albumId}` : null;

  const featureItems: string[] = [];
  if (design.Width && design.Height) {
    featureItems.push(`Stitch count: ${design.Width} x ${design.Height}`);
  }
  if (design.NColors) {
    featureItems.push(`${design.NColors} colors in the palette`);
  }
  if (design.NDownloaded) {
    featureItems.push(`Downloaded ${design.NDownloaded} times`);
  }
  const aspectRatio =
    design.Width && design.Height && design.Width > 0 && design.Height > 0
      ? `${design.Width} / ${design.Height}`
      : '1 / 1';
  const canonicalUrl = buildCanonicalUrl(CreateDesignUrl(design));
  const pinterestImageUrl = toAbsoluteUrl(design.ImageUrl) || DEFAULT_OG_IMAGE;
  const pinterestPinUrl =
    toAbsoluteUrl(design.PinterestPinUrl) ||
    (design.PinterestPinId ? buildPinterestPinUrl(design.PinterestPinId) : null);
  const pinterestShareUrl = buildPinterestShareUrl(
    canonicalUrl,
    pinterestImageUrl,
    `${design.Caption} - free cross-stitch pattern`
  );
  const pinterestHref = pinterestPinUrl || pinterestShareUrl;
  const pinterestLabel = pinterestPinUrl ? 'Open on Pinterest' : 'Save on Pinterest';
  const pinterestTrackingMode = pinterestPinUrl ? 'existing_pin' : 'create_pin';

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-center text-3xl font-bold mb-6">{design.Caption}</h1>
      <div className="max-w-3xl mx-auto">
        <div className="border border-gray-500 rounded-lg shadow hover:shadow-lg p-5 text-center">
          <div
            className="mb-3"
            style={{
              width: '100%',
              display: 'block',
              textAlign: 'right',
            }}
          >
            <DesignLikeButton designId={design.DesignID} />
          </div>
          <div className="mb-3 flex items-center justify-center gap-2">
            <h2 className="text-lg font-semibold">{design.Caption}</h2>
            <PinterestSaveLink
              href={pinterestHref}
              designId={design.DesignID}
              designCaption={design.Caption}
              label={pinterestLabel}
              trackingMode={pinterestTrackingMode}
              compact
              className="h-8 w-8 shrink-0"
            />
          </div>

          {/* TOP download control (gated) */}
          <DesignDownloadControls design={design} align="center" isMissingOverride={isMissing} />
          <p className="text-sm text-gray-600 mb-4">Download the free PDF chart once you sign in.</p>

          {adsEnabled && adSlotTop && (
            <div className="my-4">
              <AdSlot slot={adSlotTop} minHeight={250} minHeightDesktop={280} />
            </div>
          )}

          <div className="text-left bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 space-y-2">
            <h3 className="text-base font-semibold text-gray-900">About this pattern</h3>
            <p className="text-sm text-gray-800">
              Each PDF includes stitch counts and a full color key so you can kit it quickly. Check the stitch size against your fabric count to estimate finished dimensions, and keep a few extra skeins on hand if you plan to backstitch or outline.
            </p>
            <h4 className="text-sm font-semibold text-gray-900">Quick finishing tips</h4>
            <ul className="list-disc list-inside text-sm text-gray-800 space-y-1">
              <li>Use shorter floss lengths to avoid tangles and keep coverage even.</li>
              <li>Secure thread ends under nearby stitches instead of bulky knots.</li>
              <li>Gently wash and press face-down on a towel before framing.</li>
            </ul>
          </div>
          {featureItems.length > 0 && (
            <ul className="text-left text-sm text-gray-700 mb-4 list-disc list-inside">
              {featureItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}

          {nav && (
            <div className="flex items-stretch gap-3 mb-5">
              <Link
                href={nav.prev ? CreateDesignUrl(nav.prev) : CreateDesignUrl(design)}
                className="flex-1 flex flex-col items-start px-4 py-3 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
              >
                <span className="text-2xl font-bold text-gray-500">←</span>
                <span className="text-sm font-semibold text-gray-700">Previous design</span>
                <span className="text-xs text-gray-400 truncate w-full mt-0.5">{nav.prev?.Caption ?? design.Caption}</span>
              </Link>
              {albumUrl && (
                <Link
                  href={albumUrl}
                  className="flex flex-col items-center justify-center px-4 py-3 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors text-center shrink-0"
                >
                  <span className="text-2xl font-bold text-gray-500">↑</span>
                  <span className="text-sm font-semibold text-gray-700">Back to album</span>
                  <span className="text-xs text-gray-400 mt-0.5">{nav.albumCaption ?? `Album ${nav.albumId}`}</span>
                </Link>
              )}
              <Link
                href={nav.next ? CreateDesignUrl(nav.next) : CreateDesignUrl(design)}
                className="flex-1 flex flex-col items-end px-4 py-3 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors text-right"
              >
                <span className="text-2xl font-bold text-gray-500">→</span>
                <span className="text-sm font-semibold text-gray-700">Next design</span>
                <span className="text-xs text-gray-400 truncate w-full mt-0.5">{nav.next?.Caption ?? design.Caption}</span>
              </Link>
            </div>
          )}

          {design.ImageUrl ? (
            <div className="mx-auto w-full max-w-[600px] mb-4">
              <div className="relative w-full" style={{ aspectRatio }}>
                <Image
                  src={design.ImageUrl}
                  alt={`${design.Caption} free cross-stitch pattern`}
                  fill
                  className="object-contain rounded"
                  sizes="(max-width: 600px) 100vw, 600px"
                />
              </div>
            </div>
          ) : (
            <div className="max-w-[200px] max-h-[200px] w-full h-auto mx-auto bg-gray-200 rounded flex items-center justify-center mb-4">
              <span className="text-gray-500 text-sm">No Image</span>
            </div>
          )}

          <p className="text-gray-700 mb-4">{design.Description || 'No description available'}</p>

          {design.SeoDescription && (
            <div className="text-gray-500 text-xs mb-4 border-t border-gray-100 pt-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Pattern description</h3>
              {design.SeoDescription.split('\n').filter(p => p.trim()).map((para, i) => (
                <p key={i} className="mb-2">{para.trim()}</p>
              ))}
            </div>
          )}

          <div className="text-left bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 space-y-2">
            <h3 className="text-base font-semibold text-gray-900">Stitch planning checklist</h3>
            <ul className="list-disc list-inside text-sm text-gray-800 space-y-1">
              <li>Measure your fabric against the stitch count to confirm finished size.</li>
              <li>Sort floss by symbol before you start; pre-thread a few needles for speed.</li>
              <li>Work in small blocks to keep counting accurate and spot mistakes early.</li>
              <li>Backstitch at the end of each session so outlines stay crisp.</li>
            </ul>
          </div>
         <div className="text-gray-700 mb-4 text-xs">
          {(design.Notes || 'No notes available')
          .split('<br />')
          .map((line, index) => (
            <p key={index}>{line.trim()}</p>
          ))}
         </div>

          {adsEnabled && adSlotBottom && (
            <div className="my-4">
              <AdSlot slot={adSlotBottom} minHeight={250} minHeightDesktop={280} />
            </div>
          )}

          {/* BOTTOM download control (gated) */}
          <DesignDownloadControls design={design} align="center" isMissingOverride={isMissing} />
        </div>
      </div>
    </div>
  );
}
