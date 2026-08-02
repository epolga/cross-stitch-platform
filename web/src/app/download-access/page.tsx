import type { Metadata } from 'next';
import { buildCanonicalUrl } from '@/lib/url-helper';
import DownloadAccessPageClient from './DownloadAccessPageClient';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value.find((item) => item && item.trim())?.trim();
  }
  return value?.trim();
}

function normalizeInternalPath(value: string | undefined): string {
  const trimmed = (value || '').trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return '/';
  }
  return trimmed;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  // designId/caption/image are referrer-tracking params (which design sent the
  // visitor here) — real, valuable data kept in the URL/analytics, but they
  // turn this one page into a near-duplicate crawlable URL per design, same
  // issue already fixed on /photo-to-cross-stitch. noindex on the
  // design-tagged variants is the fix; the bare URL stays indexable.
  const hasReferrerId = Boolean(params?.designId || params?.caption || params?.image);

  return {
    title: 'Choose a Download Plan | Cross Stitch Designs',
    description: 'Review the monthly and yearly download plans before continuing to registration.',
    alternates: { canonical: buildCanonicalUrl('/download-access') },
    robots: hasReferrerId ? 'noindex, follow' : 'index, follow',
  };
}

export default async function DownloadAccessPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const returnPath = normalizeInternalPath(getSingleValue(resolvedSearchParams.returnTo));
  const designIdValue = getSingleValue(resolvedSearchParams.designId);
  const designId = designIdValue ? Number.parseInt(designIdValue, 10) : undefined;
  const designCaption = getSingleValue(resolvedSearchParams.caption);
  const designImageUrl = getSingleValue(resolvedSearchParams.image);

  return (
    <DownloadAccessPageClient
      returnPath={returnPath}
      designId={Number.isFinite(designId) ? designId : undefined}
      designCaption={designCaption}
      designImageUrl={designImageUrl}
    />
  );
}
