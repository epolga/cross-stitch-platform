import { NextRequest, NextResponse } from 'next/server';
import { savePattern } from '@/lib/pattern-storage';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 });

    const body = await request.json();
    const { name, width, height, palette, grid, thumbnail, hiddenColors, researchImageKey, sourceImageKey, sourceImageMaskKey } = body;

    if (!Array.isArray(grid) || !Array.isArray(palette))
      return NextResponse.json({ error: 'Invalid pattern data' }, { status: 400 });
    if (typeof width !== 'number' || typeof height !== 'number' || width < 1 || height < 1)
      return NextResponse.json({ error: 'Invalid dimensions' }, { status: 400 });
    if (grid.length !== height || grid[0]?.length !== width)
      return NextResponse.json({ error: 'Grid dimensions mismatch' }, { status: 400 });

    const id = await savePattern(
      String(name ?? 'Untitled'),
      width, height, palette, grid, session.userId,
      typeof thumbnail === 'string' ? thumbnail : undefined,
      Array.isArray(hiddenColors) ? hiddenColors as number[] : undefined,
      undefined, // sourceGenerationId — not set from this general-purpose save route
      typeof researchImageKey === 'string' ? researchImageKey : undefined,
      typeof sourceImageKey === 'string' ? sourceImageKey : undefined,
      typeof sourceImageMaskKey === 'string' ? sourceImageMaskKey : undefined,
    );

    return NextResponse.json({ id });
  } catch (e) {
    console.error('[converter/patterns] POST error:', e);
    const msg = e instanceof Error ? e.message : 'Failed to save pattern';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
