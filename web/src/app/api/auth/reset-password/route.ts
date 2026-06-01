// src/app/api/auth/reset-password/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  consumePasswordResetToken,
  updateUserPassword,
} from '@/lib/password-reset';

export async function POST(req: NextRequest) {
  try {
    const { token, password, confirmPassword } =
      await req.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Missing token' },
        { status: 400 },
      );
    }

    if (
      !password ||
      typeof password !== 'string' ||
      !confirmPassword ||
      typeof confirmPassword !== 'string'
    ) {
      return NextResponse.json(
        { error: 'Password and confirmation are required' },
        { status: 400 },
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: 'Passwords do not match' },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        {
          error:
            'Password should be at least 6 characters long',
        },
        { status: 400 },
      );
    }

    const email = await consumePasswordResetToken(token);

    if (!email) {
      return NextResponse.json(
        {
          error:
            'The reset link is invalid or has expired. Please request a new one.',
        },
        { status: 400 },
      );
    }

    await updateUserPassword(email, password);

    return NextResponse.json({
      ok: true,
      message: 'Password has been updated.',
    });
  } catch (error) {
    console.error('[reset-password] Error:', error);
    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 },
    );
  }
}
