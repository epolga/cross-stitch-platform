import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { updateFeatureRequestStatus, type RequestStatus } from '@/lib/feature-requests';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: RequestStatus[] = ['new', 'reviewed', 'planned', 'done', 'rejected'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await request.json() as { status?: unknown };
    if (!VALID_STATUSES.includes(body.status as RequestStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    await updateFeatureRequestStatus(id, body.status as RequestStatus);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[admin/feature-requests] PATCH error:', e);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}
