import { NextRequest, NextResponse } from 'next/server';
import { getDesignById } from '@/lib/data-access';
import {
  getDesignLikeState,
  getUserDesignVote,
  isResourceNotFound,
  removeDesignLike,
  setDesignVote,
} from '@/lib/design-likes';
import { sendEmailToAdmin } from '@/lib/email-service';
import { buildCanonicalUrl, CreateDesignUrl } from '@/lib/url-helper';
import { getSession } from '@/lib/session';

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return request.headers.get('x-real-ip') || 'Unknown';
}

// Rate limit: 20 requests per IP per minute across GET/POST/DELETE on this
// route. Caught bots were hammering GET at hundreds of requests per IP —
// this bounds that regardless of which method a future bot uses.
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const hits = (rateLimitMap.get(ip) ?? []).filter((t) => t > cutoff);
  hits.push(now);
  rateLimitMap.set(ip, hits);

  if (rateLimitMap.size > 10_000) {
    for (const [key, times] of rateLimitMap) {
      if (times.every((t) => t <= cutoff)) rateLimitMap.delete(key);
    }
  }

  return hits.length > RATE_LIMIT_MAX;
}

// Defense in depth: if the caller has a valid session cookie, the claimed
// email must match it — a logged-in user can't vote/read as someone else.
// Callers with no session at all fall through unchanged (most of the app
// still identifies users by email only, not the session cookie).
async function sessionEmailMismatch(request: NextRequest, claimedEmail: string | undefined): Promise<boolean> {
  if (!claimedEmail) return false;
  const session = await getSession(request);
  if (!session) return false;
  return session.email.toLowerCase() !== claimedEmail;
}

async function sendVoteNotification(params: {
  request: NextRequest;
  design: NonNullable<Awaited<ReturnType<typeof getDesignById>>>;
  email: string;
  previousVote: 'up' | 'down' | null;
  currentVote: 'up' | 'down' | null;
  count: number;
  requestedDirection: 'up' | 'down';
}): Promise<void> {
  const { request, design, email, previousVote, currentVote, count, requestedDirection } = params;
  const designUrl = buildCanonicalUrl(CreateDesignUrl(design));
  const clientIp = getClientIp(request);
  const subject = currentVote === null ? 'Design vote cleared' : 'New design vote';
  const body = [
    `Design: ${design.Caption}`,
    `Design ID: ${design.DesignID}`,
    `Design URL: ${designUrl}`,
    `User email: ${email}`,
    `Requested direction: ${requestedDirection}`,
    `Previous vote: ${previousVote ?? 'none'}`,
    `Current vote: ${currentVote ?? 'none'}`,
    `Current score: ${count}`,
    `Client IP: ${clientIp}`,
    `Timestamp: ${new Date().toISOString()}`,
  ].join('\n');

  await sendEmailToAdmin(subject, body, false);
}

async function resolveDesignId(params: Promise<{ designId: string }>): Promise<number | null> {
  const { designId } = await params;
  const parsed = parseInt(designId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function getEmailFromRequest(request: NextRequest, bodyEmail?: string): string | undefined {
  const queryEmail = request.nextUrl.searchParams.get('email');
  const headerEmail = request.headers.get('x-user-email');
  const email = bodyEmail || queryEmail || headerEmail || '';
  const normalized = email.trim().toLowerCase();
  return normalized || undefined;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ designId: string }> }) {
  if (isRateLimited(getClientIp(request))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const designId = await resolveDesignId(params);
  if (designId === null) {
    return NextResponse.json({ error: 'Invalid designId' }, { status: 400 });
  }

  const email = getEmailFromRequest(request);
  if (await sessionEmailMismatch(request, email)) {
    return NextResponse.json({ error: 'Email does not match session' }, { status: 403 });
  }

  try {
    const state = await getDesignLikeState(designId, email);
    return NextResponse.json({ designId, ...state }, { status: 200 });
  } catch (error) {
    console.error('[design-like][GET] Failed to load like state:', error);
    const status = isResourceNotFound(error) ? 500 : 500;
    const message = isResourceNotFound(error)
      ? 'Likes table not found'
      : 'Failed to load like state';
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ designId: string }> }) {
  if (isRateLimited(getClientIp(request))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const designId = await resolveDesignId(params);
  if (designId === null) {
    return NextResponse.json({ error: 'Invalid designId' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string; direction?: 'up' | 'down' };
  const email = getEmailFromRequest(request, body.email);
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 401 });
  }
  if (await sessionEmailMismatch(request, email)) {
    return NextResponse.json({ error: 'Email does not match session' }, { status: 403 });
  }
  if (body.direction !== 'up' && body.direction !== 'down') {
    return NextResponse.json({ error: 'Vote direction is required' }, { status: 400 });
  }

  const design = await getDesignById(designId);
  if (!design) {
    return NextResponse.json({ error: 'Design not found' }, { status: 404 });
  }

  try {
    const previousVote = await getUserDesignVote(designId, email);
    const state = await setDesignVote(designId, email, body.direction);

    if (previousVote !== state.currentUserVote) {
      void sendVoteNotification({
        request,
        design,
        email,
        previousVote,
        currentVote: state.currentUserVote,
        count: state.count,
        requestedDirection: body.direction,
      }).catch((notificationError) => {
        console.error('[design-like][POST] Failed to send admin vote notification:', notificationError);
      });
    }

    return NextResponse.json({ designId, ...state }, { status: 200 });
  } catch (error) {
    console.error('[design-like][POST] Failed to update vote:', error);
    const message = isResourceNotFound(error) ? 'Likes table not found' : 'Failed to update vote';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ designId: string }> }) {
  if (isRateLimited(getClientIp(request))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const designId = await resolveDesignId(params);
  if (designId === null) {
    return NextResponse.json({ error: 'Invalid designId' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = getEmailFromRequest(request, body.email);
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 401 });
  }
  if (await sessionEmailMismatch(request, email)) {
    return NextResponse.json({ error: 'Email does not match session' }, { status: 403 });
  }

  try {
    await removeDesignLike(designId, email);
    const state = await getDesignLikeState(designId, email);
    return NextResponse.json({ designId, ...state }, { status: 200 });
  } catch (error) {
    console.error('[design-like][DELETE] Failed to remove like:', error);
    const message = isResourceNotFound(error) ? 'Likes table not found' : 'Failed to remove like';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
