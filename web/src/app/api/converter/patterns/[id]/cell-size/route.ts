import { NextRequest, NextResponse } from 'next/server';
import { loadPattern, saveCellSize } from '@/lib/pattern-storage';
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
    const { cellSize } = body;
    if (typeof cellSize !== 'number' || !Number.isFinite(cellSize) || cellSize < 4 || cellSize > 40)
      return NextResponse.json({ error: 'Invalid cell size' }, { status: 400 });

    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 });

    const existing = await loadPattern(id);
    if (!existing) return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
    if (existing.ownerID !== session.userId)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    await saveCellSize(id, Math.round(cellSize));
    return NextResponse.json({ id });
  } catch (e) {
    console.error('[converter/patterns/cell-size] PUT error:', e);
    const msg = e instanceof Error ? e.message : 'Failed to save cell size';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
