import type { Metadata } from 'next';
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

export const metadata: Metadata = {
  title: 'Choose a Download Plan | Cross Stitch Designs',
  description: 'Review the monthly and yearly download plans before continuing to registration.',
};

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
