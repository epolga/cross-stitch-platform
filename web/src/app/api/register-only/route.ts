// src/app/api/register-only/route.ts
import { NextResponse } from 'next/server';
import {
  saveUserToDynamoDB,
  EmailExistsError,
  type NewUserRegistration,
} from '@/lib/users';
import { sendEmail } from '@/lib/email-service';
import { randomUUID } from 'crypto';
import type { RegistrationSourceInfo } from '@/app/types/registration';
import { getSiteBaseUrl, normalizeBaseUrl } from '@/lib/url-helper';

type RegisterRequest = NewUserRegistration & {
  sourceInfo?: RegistrationSourceInfo | null;
};

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

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as Partial<RegisterRequest>;

    if (!body.email || !body.firstName || !body.password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      );
    }

    const sourceInfo = body.sourceInfo;

    const verificationToken = randomUUID();
    const verificationTokenExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(); // 48h
    const redirectTarget = sourceInfo?.designUrl;

    await saveUserToDynamoDB({
      email: body.email,
      firstName: body.firstName,
      password: body.password,
      verificationToken,
      verificationTokenExpiresAt,
      startTrial: true,
    });

    const baseUrl = resolveBaseUrl(req);
    const verificationLink = `${baseUrl}/api/register-only/verify?token=${verificationToken}${
      redirectTarget ? `&redirect=${encodeURIComponent(redirectTarget)}` : ''
    }`;

    const sourceNote = sourceInfo?.designCaption || sourceInfo?.designUrl || '';

    await sendEmail({
      to: body.email,
      subject: 'Verify your email for Cross Stitch Pattern',
      body: `
        <p>Hello ${body.firstName},</p>
        <p>Thanks for registering at Cross Stitch Pattern. Please verify your email to complete your registration:</p>
        <p><a href="${verificationLink}">${verificationLink}</a></p>
        <p>If you did not request this, you can ignore this email.</p>
        ${sourceNote ? `<p>Requested from: ${sourceNote}</p>` : ''}
      `,
      html: true,
    });

    return NextResponse.json(
      { ok: true, message: 'Please check your email to verify your address.' },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof EmailExistsError) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 },
      );
    }

    const message =
      error instanceof Error ? error.message : 'Server error';

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
