import { NextResponse } from 'next/server';
import { getDesignById, incrementDesignDownloadCount } from '@/lib/data-access';
import { createRateLimiter, getClientIp } from '@/lib/rateLimit';

// Rate limit: 20 increments per IP per minute. NDownloaded is unauthenticated
// (fired fire-and-forget by DownloadPdfLink on click, no login required) and
// is shown publicly on design pages ("Downloaded N times") — a bot with a
// fake account was found inflating it across many designs with plain POSTs.
const isRateLimited = createRateLimiter(60_000, 20);

export async function GET(request: Request, { params }: { params: Promise<{ designId: string }> }) {
  const { designId } = await params;

  try {
    // Parse designId as an integer
    const id = parseInt(designId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid designId' }, { status: 400 });
    }

    // Fetch design using dataAccess
    const design = await getDesignById(id);

    // Check if design exists
    if (!design) {
      return NextResponse.json({ error: 'Design not found' }, { status: 404 });
    }

    // Return the design
    return NextResponse.json(design, { status: 200 });
  } catch (error) {
    console.error('Error fetching design:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ designId: string }> }) {
  if (isRateLimited(getClientIp(request))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { designId } = await params;

  try {
    const id = parseInt(designId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid designId' }, { status: 400 });
    }

    await incrementDesignDownloadCount(id);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('Error updating download count:', error);
    return NextResponse.json(
      { error: 'Failed to update download count' },
      { status: 500 }
    );
  }
}
