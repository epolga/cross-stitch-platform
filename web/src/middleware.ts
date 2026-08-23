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

  // Legacy pagination param from the pre-migration site (?page=N) — current
  // pagination uses ?nPage=. No code generates ?page= links anymore, but old
  // indexed URLs still get crawled, render identical page-1 content, and GSC
  // flags them "Duplicate without user-selected canonical". Since nothing
  // internally links these, a redirect (not just noindex) is the clean fix —
  // passes any residual link equity to the canonical homepage instead of
  // leaving a dead-end indexable duplicate.
  if (
    request.nextUrl.pathname === '/' &&
    request.nextUrl.searchParams.has('page') &&
    !request.nextUrl.searchParams.has('nPage')
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.searchParams.delete('page');
    return NextResponse.redirect(redirectUrl, 308);
  }

  const g = globalThis as typeof globalThis & {
    __LAST_REQUEST_URL__?: string;
  };

  g.__LAST_REQUEST_URL__ = `${request.method} ${request.nextUrl.pathname}${request.nextUrl.search}`;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

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
