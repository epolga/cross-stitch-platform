import { NextResponse } from 'next/server';
import { sendEmailToAdmin } from '@/lib/email-service';

const flag = Symbol.for('cross-stitch.logClientErrorThrottle');
const globals = globalThis as Record<string | symbol, unknown>;

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const timestamp = new Date().toISOString();

    const payload = {
      timestamp,
      message: typeof body.message === 'string' ? body.message : 'Unknown client error',
      stack: typeof body.stack === 'string' ? body.stack : undefined,
      digest: typeof body.digest === 'string' ? body.digest : undefined,
      url: typeof body.url === 'string' ? body.url : undefined,
      userAgent: typeof body.userAgent === 'string' ? body.userAgent : undefined,
    };

    // Log server-side for visibility
    console.error('Client error reported:', JSON.stringify(payload, null, 2));

    // Throttle admin emails (minimum interval 60s)
    const now = Date.now();
    const lastSent = (globals[flag] as number | undefined) ?? 0;
    if (now - lastSent >= 60_000) {
      globals[flag] = now;
      const pretty = JSON.stringify(payload, null, 2);
      try {
        await sendEmailToAdmin('[Client Error] App error reported', `<pre>${pretty}</pre>`, true);
      } catch (err) {
        console.error('Failed to email admin about client error:', err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
