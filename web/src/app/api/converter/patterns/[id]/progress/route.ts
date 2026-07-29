import { NextRequest, NextResponse } from 'next/server';
import { loadPattern, saveProgress } from '@/lib/pattern-storage';
import { rleDecode } from '@/lib/rle';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id || !/^[0-9a-f-]{36}$/.test(id))
      return NextResponse.json({ error: 'Invalid pattern ID' }, { status: 400 });

    const body = await request.json();
    const { progress } = body;
    if (typeof progress !== 'string')
      return NextResponse.json({ error: 'Invalid progress data' }, { status: 400 });

    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 });

    const existing = await loadPattern(id);
    if (!existing) return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
    if (existing.ownerID !== session.userId)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    if (progress.length > 0) {
      const decoded = rleDecode(progress, existing.width, existing.height);
      if (decoded.length !== existing.height || decoded[0]?.length !== existing.width)
        return NextResponse.json({ error: 'Progress dimensions mismatch' }, { status: 400 });
    }

    await saveProgress(id, progress);
    return NextResponse.json({ id });
  } catch (e) {
    console.error('[converter/patterns/progress] PUT error:', e);
    const msg = e instanceof Error ? e.message : 'Failed to save progress';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
