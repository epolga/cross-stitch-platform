import { NextResponse } from 'next/server';
import { isResearchImageCollectionEnabled } from '@/lib/research-consent';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { enabled: isResearchImageCollectionEnabled() },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
