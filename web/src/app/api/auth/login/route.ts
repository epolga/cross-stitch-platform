import { NextRequest, NextResponse } from 'next/server';
import { verifyUserWithProfile } from '@/lib/data-access';
import { updateLastSeenAtByEmail } from '@/lib/users';

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
      return NextResponse.json({ success: true, email: user.email, firstName: user.firstName });
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
