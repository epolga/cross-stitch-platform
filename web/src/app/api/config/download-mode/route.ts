import { NextResponse } from 'next/server';

type DownloadMode = 'free' | 'register' | 'paid';

export const dynamic = 'force-dynamic';

function normalizeDownloadMode(raw: string): DownloadMode {
  if (raw === 'free' || raw === 'register' || raw === 'paid') return raw;
  return 'register';
}

export async function GET(): Promise<NextResponse> {
  const raw = (
    process.env.DOWNLOAD_MODE ||
    process.env.NEXT_PUBLIC_DOWNLOAD_MODE ||
    ''
  )
    .toLowerCase()
    .trim();

  const mode = normalizeDownloadMode(raw);

  return NextResponse.json(
    { mode },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
