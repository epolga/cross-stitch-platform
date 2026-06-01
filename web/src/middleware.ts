// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const requestHost = (forwardedHost || request.headers.get('host') || '').split(',')[0].trim().toLowerCase();

  if (
    requestHost === 'cross-stitch-pattern.net' ||
    requestHost === 'www.cross-stitch-pattern.net'
  ) {
    const redirectUrl = new URL(
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
      'https://cross-stitch.com'
    );
    return NextResponse.redirect(redirectUrl, 308);
  }

  const g = globalThis as typeof globalThis & {
    __LAST_REQUEST_URL__?: string;
  };

  g.__LAST_REQUEST_URL__ = `${request.method} ${request.nextUrl.pathname}${request.nextUrl.search}`;

  const response = NextResponse.next();

  // Apply HSTS only for HTTPS requests to enforce secure transport.
  const isHttps =
    request.headers.get('x-forwarded-proto') === 'https' ||
    request.nextUrl.protocol === 'https:';
  if (isHttps) {
    // HSTS without subdomains/preload
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
