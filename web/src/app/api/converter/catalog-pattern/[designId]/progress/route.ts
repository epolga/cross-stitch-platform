import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getDesignById } from '@/lib/data-access';
import { saveCatalogProgress } from '@/lib/catalog-progress-storage';
import { rleDecode } from '@/lib/rle';

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
    const { progress } = body;
    if (typeof progress !== 'string')
      return NextResponse.json({ error: 'Invalid progress data' }, { status: 400 });

    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 });

    const design = await getDesignById(designId);
    if (!design || !design.EditorPatternKey)
      return NextResponse.json({ error: 'No editor pattern for this design' }, { status: 404 });

    if (progress.length > 0) {
      const decoded = rleDecode(progress, design.Width, design.Height);
      if (decoded.length !== design.Height || decoded[0]?.length !== design.Width)
        return NextResponse.json({ error: 'Progress dimensions mismatch' }, { status: 400 });
    }

    await saveCatalogProgress(session.userId, designId, progress);
    return NextResponse.json({ designId });
  } catch (e) {
    console.error('[converter/catalog-pattern/progress] PUT error:', e);
    const msg = e instanceof Error ? e.message : 'Failed to save progress';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
