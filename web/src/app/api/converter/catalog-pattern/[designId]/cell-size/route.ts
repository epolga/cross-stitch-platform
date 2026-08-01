import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getDesignById } from '@/lib/data-access';
import { saveCatalogCellSize } from '@/lib/catalog-progress-storage';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ designId: string }> },
) {
  try {
    const { designId: designIdStr } = await params;
    const designId = parseInt(designIdStr, 10);
    if (!Number.isFinite(designId) || designId <= 0)
      return NextResponse.json({ error: 'Invalid design ID' }, { status: 400 });

    const body = await request.json();
    const { cellSize } = body;
    if (typeof cellSize !== 'number' || !Number.isFinite(cellSize) || cellSize < 4 || cellSize > 40)
      return NextResponse.json({ error: 'Invalid cell size' }, { status: 400 });

    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 });

    const design = await getDesignById(designId);
    if (!design || !design.EditorPatternKey)
      return NextResponse.json({ error: 'No editor pattern for this design' }, { status: 404 });

    await saveCatalogCellSize(session.userId, designId, Math.round(cellSize));
    return NextResponse.json({ designId });
  } catch (e) {
    console.error('[converter/catalog-pattern/cell-size] PUT error:', e);
    const msg = e instanceof Error ? e.message : 'Failed to save cell size';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
