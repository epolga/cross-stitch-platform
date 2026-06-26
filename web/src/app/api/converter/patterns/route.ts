import { NextRequest, NextResponse } from 'next/server';
import { savePattern } from '@/lib/pattern-storage';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, width, height, palette, grid } = body;

    if (!Array.isArray(grid) || !Array.isArray(palette))
      return NextResponse.json({ error: 'Invalid pattern data' }, { status: 400 });
    if (typeof width !== 'number' || typeof height !== 'number' || width < 1 || height < 1)
      return NextResponse.json({ error: 'Invalid dimensions' }, { status: 400 });
    if (grid.length !== height || grid[0]?.length !== width)
      return NextResponse.json({ error: 'Grid dimensions mismatch' }, { status: 400 });

    const id = await savePattern(
      String(name ?? 'Untitled'),
      width, height, palette, grid,
    );

    return NextResponse.json({ id });
  } catch (e) {
    console.error('[converter/patterns] POST error:', e);
    const msg = e instanceof Error ? e.message : 'Failed to save pattern';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
