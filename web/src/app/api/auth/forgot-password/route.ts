// File: src/app/api/auth/forgot-password/route.ts

import { NextResponse } from 'next/server';
import { sendEmail, sendEmailToAdmin } from '@/lib/email-service';
import { getSiteHostname } from '@/lib/url-helper';

const isValidEmail = (email: string): boolean =>
  typeof email === 'string' && email.includes('@') && email.includes('.');

const siteHostname = getSiteHostname().replace(/^www\./i, '');

export async function POST(request: Request): Promise<Response> {
  try {
    const { email } = (await request.json()) as { email?: string };

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address' },
        { status: 400 },
      );
    }

    // Письмо пользователю
    const userBodyHtml = `
      <p>Hello,</p>
      <p>We received a request to reset the password for your account on ${siteHostname}.</p>
      <p>If this was you, please reply to this email or contact site support to reset your password.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `;

    await sendEmail({
      to: email,
      subject: 'Password reset request',
      body: userBodyHtml,
      html: true,
    });

    // Уведомление админа, чтобы вы видели такие запросы
    const adminBody = `Password reset requested for email: ${email}`;
    await sendEmailToAdmin('Password reset requested', adminBody, false);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Forgot-password error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
