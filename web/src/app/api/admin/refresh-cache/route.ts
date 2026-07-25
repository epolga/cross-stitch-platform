import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { refreshCache } from '@/lib/data-access';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const start = Date.now();
    await refreshCache();
    return NextResponse.json({ ok: true, ms: Date.now() - start });
  } catch (e) {
    console.error('[admin/refresh-cache] POST error:', e);
    return NextResponse.json({ error: 'Failed to refresh cache' }, { status: 500 });
  }
}
