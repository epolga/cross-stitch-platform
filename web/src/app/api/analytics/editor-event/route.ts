import { NextRequest, NextResponse } from 'next/server';
import { logEditorEvent } from '@/lib/editor-events';
import { getSession } from '@/lib/session';
import { getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const SERVER_SIDE_EVENTS = new Set([
  'editor_opened',
  'pattern_generated',
  'pdf_exported',
  'feedback_submitted',
  'editor_error',
  'pattern_quality_feedback',
  'pattern_generated_return_visit',
]);

// Rate limit: one write per sessionId+eventType per minute
const rateLimitMap = new Map<string, number>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const { eventType, sessionId, ...params } = body;

    if (typeof eventType !== 'string' || !eventType) {
      return NextResponse.json({ error: 'eventType required' }, { status: 400 });
    }
    if (typeof sessionId !== 'string' || !sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }
    if (!SERVER_SIDE_EVENTS.has(eventType)) {
      return NextResponse.json({ ok: true });
    }

    if (req.cookies.get('no_track')?.value === '1') {
      return NextResponse.json({ ok: true });
    }

    const session = await getSession(req);
    if (session) {
      const adminEmails = (process.env.ADMIN_EMAILS || '')
        .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
      if (adminEmails.includes(session.email.toLowerCase())) {
        return NextResponse.json({ ok: true });
      }
    }

    const now = Date.now();
    const key = `${sessionId}:${eventType}`;
    if ((rateLimitMap.get(key) ?? 0) > now - 60_000) {
      return NextResponse.json({ ok: true });
    }
    rateLimitMap.set(key, now);

    if (rateLimitMap.size > 10_000) {
      const cutoff = now - 60_000;
      for (const [k, t] of rateLimitMap) if (t < cutoff) rateLimitMap.delete(k);
    }

    await logEditorEvent({
      eventType,
      sessionId,
      ip:            getClientIp(req),
      userEmail:     session?.email,
      patternId:     typeof params.patternId    === 'string' ? params.patternId    : undefined,
      patternWidth:  typeof params.patternWidth  === 'number' ? params.patternWidth  : undefined,
      patternHeight: typeof params.patternHeight === 'number' ? params.patternHeight : undefined,
      colorCount:    typeof params.colorCount    === 'number' ? params.colorCount    : undefined,
      source:        typeof params.source        === 'string' ? params.source        : undefined,
      errorCode:     typeof params.errorCode     === 'string' ? params.errorCode     : undefined,
      step:          typeof params.step          === 'string' ? params.step          : undefined,
      importance:    typeof params.importance    === 'string' ? params.importance    : undefined,
      rating:        typeof params.rating        === 'string' ? params.rating        : undefined,
      qualityReason: typeof params.qualityReason === 'string' ? params.qualityReason : undefined,
      gapHours:      typeof params.gapHours      === 'number' ? params.gapHours      : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[editor-event]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
