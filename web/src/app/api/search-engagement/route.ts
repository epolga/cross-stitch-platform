import { NextRequest, NextResponse } from 'next/server';
import { logSearchEngagement, type EngagementAction } from '@/lib/search-engagement';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { searchId, designId, action } = await request.json();

    if (!searchId || typeof searchId !== 'string') {
      return NextResponse.json({ error: 'searchId is required' }, { status: 400 });
    }
    const id = Number(designId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'designId is required' }, { status: 400 });
    }
    if (action !== 'click' && action !== 'download') {
      return NextResponse.json({ error: 'action must be "click" or "download"' }, { status: 400 });
    }

    await logSearchEngagement(searchId, id, action as EngagementAction);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[search-engagement] error:', err);
    return NextResponse.json({ error: 'Failed to log engagement' }, { status: 500 });
  }
}
