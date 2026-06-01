export type DownloadMode = 'free' | 'register' | 'paid';

export function normalizeDownloadMode(raw: string | null | undefined): DownloadMode {
  const normalized = (raw || '').toLowerCase().trim();
  if (normalized === 'free' || normalized === 'register' || normalized === 'paid') {
    return normalized;
  }
  return 'register';
}

export function resolveServerDownloadMode(): DownloadMode {
  return normalizeDownloadMode(
    process.env.DOWNLOAD_MODE || process.env.NEXT_PUBLIC_DOWNLOAD_MODE,
  );
}

export function isPaidDownloadMode(): boolean {
  return resolveServerDownloadMode() === 'paid';
}
