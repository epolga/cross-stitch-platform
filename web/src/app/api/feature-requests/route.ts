import { NextRequest, NextResponse } from 'next/server';
import { saveFeatureRequest, type Importance } from '@/lib/feature-requests';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const VALID_IMPORTANCE: Importance[] = ['nice-to-have', 'important', 'need-this'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      text?: unknown;
      importance?: unknown;
      email?: unknown;
      pageUrl?: unknown;
      patternWidth?: unknown;
      patternHeight?: unknown;
      colorsCount?: unknown;
      editorTimeSeconds?: unknown;
      userChangedStitchesCount?: unknown;
      exportedPdf?: unknown;
    };

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (text.length < 5)    return NextResponse.json({ error: 'Please write at least a few words.' }, { status: 400 });
    if (text.length > 2000) return NextResponse.json({ error: 'That\'s a bit long — please keep it under 2000 characters.' }, { status: 400 });

    const importance = VALID_IMPORTANCE.includes(body.importance as Importance)
      ? (body.importance as Importance)
      : 'nice-to-have';

    const email = typeof body.email === 'string' && body.email.includes('@')
      ? body.email.trim().toLowerCase()
      : undefined;

    const session = await getSession(request);

    const id = await saveFeatureRequest({
      text,
      importance,
      email,
      pageUrl:                  typeof body.pageUrl === 'string' ? body.pageUrl : undefined,
      patternWidth:             typeof body.patternWidth === 'number' ? body.patternWidth : undefined,
      patternHeight:            typeof body.patternHeight === 'number' ? body.patternHeight : undefined,
      colorsCount:              typeof body.colorsCount === 'number' ? body.colorsCount : undefined,
      editorTimeSeconds:        typeof body.editorTimeSeconds === 'number' ? body.editorTimeSeconds : undefined,
      userChangedStitchesCount: typeof body.userChangedStitchesCount === 'number' ? body.userChangedStitchesCount : undefined,
      exportedPdf:              typeof body.exportedPdf === 'boolean' ? body.exportedPdf : undefined,
      userId:                   session?.userId,
      browserLanguage:          request.headers.get('accept-language')?.split(',')[0] ?? undefined,
      userAgent:                request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error('[feature-requests] POST error:', e);
    return NextResponse.json({ error: 'Failed to save suggestion' }, { status: 500 });
  }
}
