import { NextRequest, NextResponse } from 'next/server';
import { loadPattern } from '@/lib/pattern-storage';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id || !/^[0-9a-f-]{36}$/.test(id))
      return NextResponse.json({ error: 'Invalid pattern ID' }, { status: 400 });

    const pattern = await loadPattern(id);
    if (!pattern)
      return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });

    return NextResponse.json(pattern);
  } catch (e) {
    console.error('[converter/patterns] GET error:', e);
    return NextResponse.json({ error: 'Failed to load pattern' }, { status: 500 });
  }
}
