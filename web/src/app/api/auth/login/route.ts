import { NextRequest, NextResponse } from 'next/server';
import { verifyUserWithProfile } from '@/lib/data-access';
import { updateLastSeenAtByEmail } from '@/lib/users';
import { establishSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    console.log('API: Login request received');
    const { email, password } = await request.json();
    console.log('API: Received login request:', { email });

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const user = await verifyUserWithProfile(email, password);
    console.log('API: verifyUser result:', Boolean(user));

    if (user) {
      try {
        await updateLastSeenAtByEmail(user.email);
      } catch (err) {
        console.error('[login] Failed to update LastSeenAt:', err);
      }
      const response = NextResponse.json({ success: true, email: user.email, firstName: user.firstName });
      await establishSession(response, { userId: user.userId, email: user.email });

      const adminEmails = (process.env.ADMIN_EMAILS || '')
        .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
      if (adminEmails.includes(user.email.toLowerCase())) {
        response.cookies.set('no_track', '1', {
          maxAge: 60 * 60 * 24 * 365 * 10,
          path: '/',
          httpOnly: false,
          sameSite: 'lax',
        });
      }

      return response;
    } else {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('API: Error during login:', error);
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}
