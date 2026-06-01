import Link from 'next/link';
import { unsubscribeUserByToken } from '@/lib/users';
import { sendEmailToAdmin } from '@/lib/email-service';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Unsubscribe from Emails | Cross Stitch Pattern',
  description: 'Update your email preferences or unsubscribe from Cross Stitch Pattern notifications.',
  robots: 'noindex, nofollow',
};

type PageProps = {
  searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
};

function getTokenFromSearchParams(
  searchParams?: Record<string, string | string[] | undefined>,
): string {
  const tokenParam = searchParams?.token;

  if (Array.isArray(tokenParam)) {
    return tokenParam[0] ?? '';
  }

  return tokenParam ?? '';
}

export default async function UnsubscribePage({
  searchParams,
}: PageProps) {
  const resolvedSearchParams = await searchParams;
  const token = getTokenFromSearchParams(resolvedSearchParams);

  let title = 'Processing unsubscribe request';
  let message =
    'Please wait while we update your preferences.';
  let adminNotified = false;

  if (!token) {
    title = 'Invalid unsubscribe link';
    message =
      'We could not read the unsubscribe token. Please use the link from your email or contact support.';
  } else {
    try {
      const result = await unsubscribeUserByToken(token);

      if (result.status === 'updated') {
        title = 'You are unsubscribed';
        message = result.email
          ? `We have stopped sending emails to ${result.email}.`
          : 'We have removed you from future emails.';
        try {
          await sendEmailToAdmin(
            'User unsubscribed',
            `User with email ${result.email ?? 'unknown email'} has unsubscribed via link token.`,
            false,
          );
          adminNotified = true;
        } catch (notifyError) {
          console.error(
            '[unsubscribe] Failed to notify admin:',
            notifyError,
          );
        }
      } else if (result.status === 'already-unsubscribed') {
        title = 'Already unsubscribed';
        message =
          'This link was already used, but you remain off our mailing list.';
      } else {
        title = 'Link not recognized';
        message =
          'We could not find a subscription matching this link. It may have expired or been used already.';
      }
    } catch (error) {
      console.error('[unsubscribe] Failed to process request:', error);
      title = 'Unable to complete request';
      message =
        'Something went wrong while updating your preferences. Please try again later.';
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">
          {title}
        </h1>
        <p className="text-gray-700">{message}</p>
        {adminNotified ? (
          <p className="text-sm text-green-700">
            Our team has been notified.
          </p>
        ) : null}
        <div className="pt-2">
          <Link
            href="/"
            className="text-blue-600 font-medium hover:underline"
          >
            Return to the homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
