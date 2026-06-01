// src/app/api/auth/request-password-reset/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  createPasswordResetToken,
  userExists,
} from '@/lib/password-reset';
import { sendPasswordResetEmail } from '@/lib/password-reset-email';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Чтобы не давать информацию, существует ли email,
    // всегда отвечаем 200, но токен создаём только если пользователь есть.
    const exists = await userExists(normalizedEmail);

    if (exists) {
      const token = await createPasswordResetToken(normalizedEmail);
      await sendPasswordResetEmail({
        to: normalizedEmail,
        token,
      });
    }

    return NextResponse.json({
      ok: true,
      message:
        'If this email is registered, you will receive a link to reset your password.',
    });
  } catch (error) {
    console.error(
      '[request-password-reset] Error:',
      error,
    );
    // Не раскрываем деталей пользователю
    return NextResponse.json(
      {
        ok: true,
        message:
          'If this email is registered, you will receive a link to reset your password.',
      },
      { status: 200 },
    );
  }
}
