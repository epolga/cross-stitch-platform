import { NextRequest, NextResponse } from 'next/server';
import { listPatternsByOwner } from '@/lib/pattern-storage';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 });

    const patterns = await listPatternsByOwner(session.userId);
    return NextResponse.json({ patterns });
  } catch (e) {
    console.error('[converter/patterns/my] GET error:', e);
    return NextResponse.json({ error: 'Failed to load patterns' }, { status: 500 });
  }
}
