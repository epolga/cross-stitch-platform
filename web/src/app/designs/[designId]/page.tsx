import Image from 'next/image';
import Link from 'next/link';
import type { Design } from '@/app/types/design';
import type { Metadata } from 'next';
import { buildCanonicalUrl, CreateAlbumUrl, CreateDesignUrl, getSiteBaseUrl } from '@/lib/url-helper';
import { isPaidDownloadMode } from '@/lib/download-mode';
import { getAdjacentDesigns, getAllAlbumCaptions } from '@/lib/data-access';
import { getRelatedLinks } from '@/lib/related-links';
import { getSimilarDesigns } from '@/lib/similar-designs';
import { DesignDownloadControls } from './DesignDownloadControls';
import DesignViewTracker from '@/app/components/DesignViewTracker';
import EditorCTAButton from '@/app/components/EditorCTAButton';
import AdSlot from '@/app/components/AdSlot';
import PinterestSaveLink from '@/app/components/PinterestSaveLink';
import DesignLikeButton from '@/app/components/DesignLikeButton';
import { getDesignById } from '@/lib/data-access';
import { promises as fs } from 'fs';
import path from 'path';
import { devLog } from '@/lib/devLog';

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
devLog("Generating metadata for designId:", designId);
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

  const baseTitle = design.SeoTitle
    ? `${design.SeoTitle} - Free Cross-Stitch Pattern`
    : `${design.Caption} (Design ${designId}) - Free Cross-Stitch Pattern`;
  const fallbackDescription = design.Description
    ? `${design.Description} (Design ${designId}${featureParts.length ? ` · ${featureParts.join(' · ')}` : ''})`
    : `Free cross-stitch pattern ${design.Caption} (Design ${designId})${featureParts.length ? ` with ${featureParts.join(' · ')}` : ''}.`;
  const description = design.SeoDescription || fallbackDescription;
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

  const [nav, allAlbums, similarDesigns] = await Promise.all([
    getAdjacentDesigns(design.DesignID),
    getAllAlbumCaptions(),
    getSimilarDesigns(design.DesignID, 12),
  ]);
  const relatedLinks = getRelatedLinks(design, nav?.albumCaption, allAlbums ?? []);
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

  const jsonLdDescription = design.SeoDescription || design.Description || `Free cross-stitch pattern: ${design.Caption}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": design.SeoTitle ? `${design.SeoTitle} - Free Cross-Stitch Pattern` : `${design.Caption} - Free Cross-Stitch Pattern`,
    "description": jsonLdDescription,
    "image": toAbsoluteUrl(design.ImageUrl) || DEFAULT_OG_IMAGE,
    "url": buildCanonicalUrl(CreateDesignUrl(design)),
    "isAccessibleForFree": true,
    "inLanguage": "en",
    "creator": { "@type": "Person", "name": "Ann" },
  };

  return (
    <div className="container mx-auto p-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="text-center text-3xl font-bold mb-6">{design.SeoTitle || design.Caption}</h1>
      <div className="max-w-3xl mx-auto md:max-w-none">
        <div className="border border-gray-500 rounded-lg shadow hover:shadow-lg p-5 text-center
                        md:grid md:grid-cols-[3fr_2fr] md:gap-8 md:p-8 md:items-start md:text-left">

          {/* META-TOP — right column on desktop, above image on mobile */}
          <div className="md:col-start-2 md:row-start-1">
            <div className="mb-3 flex items-start justify-between gap-2">
              {relatedLinks.length > 0 && (
                <div className="text-left">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Explore more patterns</p>
                  <div className="flex flex-wrap gap-1.5">
                  {relatedLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="inline-block px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs hover:bg-blue-100 transition-colors"
                    >
                      {link.label}
                    </Link>
                  ))}
                  </div>
                </div>
              )}
              <div className="ml-auto shrink-0 flex items-center gap-1">
                <PinterestSaveLink
                  href={pinterestHref}
                  designId={design.DesignID}
                  designCaption={design.Caption}
                  label={pinterestLabel}
                  trackingMode={pinterestTrackingMode}
                  compact
                  className="h-8 w-8 shrink-0"
                />
                <DesignLikeButton designId={design.DesignID} />
              </div>
            </div>

            {/* TOP download control (gated) */}
            <DesignDownloadControls design={design} align="center" isMissingOverride={isMissing} />
            <p className="text-sm text-gray-600 mb-4">Download the free PDF chart once you sign in.</p>

            {adsEnabled && adSlotTop && (
              <div className="hidden md:block my-4">
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

            <div className="my-5 flex justify-center md:justify-start">
              <EditorCTAButton
                href={`/photo-to-cross-stitch?source=design_page&designId=${design.DesignID}`}
                label="Turn your own photo into a pattern"
                eventName="design_editor_cta_clicked"
                eventParams={{ designId: design.DesignID, source: 'design_page' }}
                className="inline-block px-5 py-2.5 bg-rose-600 text-white text-sm font-medium rounded-lg hover:bg-rose-700 transition-colors"
              />
            </div>
          </div>

          {/* IMAGE — left column (sticky) on desktop, middle on mobile */}
          <div className="md:col-start-1 md:row-start-1 md:row-span-2 md:sticky md:top-4 md:self-start">
            {design.ImageUrl ? (
              <div className="mx-auto w-full max-w-[600px] md:max-w-none mb-4">
                <div className="relative w-full" style={{ aspectRatio }}>
                  <Image
                    src={design.ImageUrl}
                    alt={`${design.SeoTitle || design.Caption} free cross-stitch pattern`}
                    fill
                    priority
                    className="object-contain rounded"
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 60vw, 700px"
                  />
                </div>
              </div>
            ) : (
              <div className="max-w-[200px] max-h-[200px] w-full h-auto mx-auto bg-gray-200 rounded flex items-center justify-center mb-4">
                <span className="text-gray-500 text-sm">No Image</span>
              </div>
            )}

          </div>

          {/* META-BOTTOM — right column row 2 on desktop, below image on mobile */}
          <div className="md:col-start-2 md:row-start-2">
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

      {similarDesigns.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-bold mb-4 text-center">You may also like</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {similarDesigns.map(d => (
              <Link
                key={d.DesignID}
                href={CreateDesignUrl(d)}
                className="group block"
              >
                <div className="relative aspect-square bg-gray-100 rounded overflow-hidden border border-gray-200 group-hover:border-blue-400 transition-colors">
                  {d.ImageUrl ? (
                    <Image
                      src={d.ImageUrl}
                      alt={`${d.SeoTitle || d.Caption} cross-stitch pattern`}
                      fill
                      className="object-contain p-1"
                      sizes="(max-width: 640px) 30vw, (max-width: 768px) 22vw, 15vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No image</div>
                  )}
                </div>
                <p className="mt-1 text-xs text-center truncate text-gray-700 group-hover:text-blue-600">{d.Caption}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
      <DesignViewTracker designId={design.DesignID} />
    </div>
  );
}
