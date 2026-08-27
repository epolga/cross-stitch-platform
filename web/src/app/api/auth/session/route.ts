import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getVerifiedUserByCid } from '@/lib/users';

// Lets the client verify (and self-heal) its login state against the real
// server-side session cookie, instead of trusting only the client-side
// `isLoggedIn` localStorage flag. That flag is set once, on the tab/browser
// context where a login/registration/auto-login actually happened — if a
// visitor ends up in a different tab or browser context afterward (e.g. an
// email verification link opened in a different app's in-app browser, or a
// tab that was open before the flag got set elsewhere), the flag never
// reaches them even though their session cookie may already be valid
// (real report, 2026-08-27: registered, verified, but "Download" kept
// asking her to register again).
export async function GET(request: NextRequest): Promise<Response> {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ loggedIn: false });
  }

  const user = await getVerifiedUserByCid(session.userId);
  return NextResponse.json({
    loggedIn: true,
    email: session.email,
    firstName: user?.firstName ?? '',
  });
}
