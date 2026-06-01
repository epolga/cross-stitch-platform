// File: src/lib/email-service.ts
// SES with AWS SDK v3, strict types, no ESLint errors.

import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from '@aws-sdk/client-ses';
import { buildSiteEmail } from '@/lib/url-helper';

const REGION = process.env.AWS_REGION || 'us-east-1';
const FROM_EMAIL = process.env.AWS_SES_FROM_EMAIL || buildSiteEmail('ann');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'olga.epstein@gmail.com';

const sesClient = new SESClient({
  region: REGION,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

/** Send an email via SES. If html === true, body is HTML; otherwise plain text. */
export async function sendEmail({
  to,
  subject,
  body,
  html = true,
  from = FROM_EMAIL,
}: {
  to: string;
  subject: string;
  body: string;
  html?: boolean;
  from?: string;
}): Promise<void> {
  const input: SendEmailCommandInput = {
    Source: from,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: html
        ? { Html: { Data: body, Charset: 'UTF-8' } }
        : { Text: { Data: body, Charset: 'UTF-8' } },
    },
  };

  await sesClient.send(new SendEmailCommand(input));
}

/** Convenience wrapper to email the admin. */
export async function sendEmailToAdmin(
  subject: string,
  body: string,
  html: boolean = true
): Promise<void> {
  await sendEmail({ to: ADMIN_EMAIL, subject, body, html });
}
