import { NextRequest, NextResponse } from 'next/server';
import { loadPattern, updatePattern } from '@/lib/pattern-storage';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id || !/^[0-9a-f-]{36}$/.test(id))
      return NextResponse.json({ error: 'Invalid pattern ID' }, { status: 400 });

    const pattern = await loadPattern(id);
    if (!pattern)
      return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });

    if (pattern.ownerID) {
      const session = await getSession(request);
      if (!session || session.userId !== pattern.ownerID)
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json(pattern);
  } catch (e) {
    console.error('[converter/patterns] GET error:', e);
    return NextResponse.json({ error: 'Failed to load pattern' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id || !/^[0-9a-f-]{36}$/.test(id))
      return NextResponse.json({ error: 'Invalid pattern ID' }, { status: 400 });

    const body = await request.json();
    const { name, width, height, palette, grid, thumbnail, hiddenColors } = body;

    if (!Array.isArray(grid) || !Array.isArray(palette))
      return NextResponse.json({ error: 'Invalid pattern data' }, { status: 400 });
    if (typeof width !== 'number' || typeof height !== 'number' || width < 1 || height < 1)
      return NextResponse.json({ error: 'Invalid dimensions' }, { status: 400 });
    if (grid.length !== height || grid[0]?.length !== width)
      return NextResponse.json({ error: 'Grid dimensions mismatch' }, { status: 400 });

    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 });

    const existing = await loadPattern(id);
    if (!existing) return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
    if (existing.ownerID && existing.ownerID !== session.userId)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    await updatePattern(
      id, String(name ?? 'Untitled'), width, height, palette, grid, session.userId,
      typeof thumbnail === 'string' ? thumbnail : undefined,
      Array.isArray(hiddenColors) ? hiddenColors as number[] : undefined,
    );
    return NextResponse.json({ id });
  } catch (e) {
    console.error('[converter/patterns] PUT error:', e);
    const msg = e instanceof Error ? e.message : 'Failed to update pattern';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
