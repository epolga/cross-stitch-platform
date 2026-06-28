import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { listFeatureRequests } from '@/lib/feature-requests';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const requests = await listFeatureRequests();
    return NextResponse.json({ requests });
  } catch (e) {
    console.error('[admin/feature-requests] GET error:', e);
    return NextResponse.json({ error: 'Failed to load requests' }, { status: 500 });
  }
}
