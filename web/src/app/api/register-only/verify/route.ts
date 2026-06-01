import { NextResponse } from 'next/server';
import { verifyUserByToken } from '@/lib/users';
import { sendEmailToAdmin } from '@/lib/email-service';
import { getSiteBaseUrl, normalizeBaseUrl } from '@/lib/url-helper';

function resolveBaseUrl(req: Request): string {
  const host = req.headers.get('host');
  if (host) {
    const protocol =
      host.includes('localhost') || host.startsWith('127.')
        ? 'http'
        : req.headers.get('x-forwarded-proto') || 'https';
    return normalizeBaseUrl(`${protocol}://${host}`);
  }
  return getSiteBaseUrl();
}

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token') || '';

    if (!token) {
      return NextResponse.json(
        { error: 'Missing verification token' },
        { status: 400 },
      );
    }

    const redirectParam = url.searchParams.get('redirect');
    const result = await verifyUserByToken(token);
    if (!result) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 400 },
      );
    }

    try {
      await sendEmailToAdmin(
        'User email verified',
        `<p>User verified their email.</p>
         <ul>
           <li><strong>Email:</strong> ${result.email ?? 'unknown'}</li>
           <li><strong>Name:</strong> ${result.firstName ?? 'unknown'}</li>
         </ul>`,
      );
    } catch (notifyError) {
      console.error('Failed to send admin verification notification:', notifyError);
    }

    const baseUrl = resolveBaseUrl(req);

    if (result.cid) {
      let targetUrl: URL;
      try {
        targetUrl = redirectParam
          ? new URL(redirectParam, baseUrl)
          : new URL(`${baseUrl}/`);
      } catch {
        targetUrl = new URL(`${baseUrl}/`);
      }
      targetUrl.searchParams.set('cid', result.cid);
      targetUrl.searchParams.set('eid', 'verified');
      return NextResponse.redirect(targetUrl.toString(), { status: 302 });
    }

    return NextResponse.json({ ok: true, message: 'Email verified' }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
