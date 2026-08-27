import { SignJWT, jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

export const SESSION_COOKIE = 'cs_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string; // cid from DDB
  email: string;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ userId: payload.userId, email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.userId !== 'string' || typeof payload.email !== 'string') return null;
    return { userId: payload.userId, email: payload.email };
  } catch {
    return null;
  }
}

export async function getSession(request: NextRequest): Promise<SessionPayload | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// The one path every "you are now logged in" moment should go through —
// password login, email-link verification, newsletter-click auto-login,
// any future one. Login/register-only/verify/login-from-email each used to
// call createSessionToken + setSessionCookie separately; login-from-email
// simply forgot the second call for a while (2026-08-27), leaving visitors
// who arrived via a newsletter link "logged in" client-side with no real
// server session. One shared function makes that specific mistake
// structurally impossible to repeat at a fourth call site.
export async function establishSession(
  response: NextResponse,
  payload: SessionPayload,
): Promise<void> {
  const token = await createSessionToken(payload);
  setSessionCookie(response, token);
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}
