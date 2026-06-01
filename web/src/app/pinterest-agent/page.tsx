import type { Metadata } from 'next';
import Link from 'next/link';
import { buildSiteEmail } from '@/lib/url-helper';

export const metadata: Metadata = {
  title: 'Cross Stitch Pinterest Agent | Cross Stitch Pattern',
  description:
    'Cross Stitch Pinterest Agent — internal analytics and reporting tool for cross-stitch.com.',
  robots: 'index, follow',
};

const supportEmail = buildSiteEmail('ann');

export default function PinterestAgentPage() {
  return (
    <div className="container mx-auto max-w-4xl p-4 space-y-6">
      <h1 className="text-3xl font-bold text-center">Cross Stitch Pinterest Agent</h1>

      <p className="text-center text-gray-600">
        Internal analytics/reporting tool for cross-stitch.com.
      </p>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Data Access</h2>
        <p>
          Uses Google Analytics read-only access. The tool reads only the
          cross-stitch.com site operator&apos;s own analytics data; it does not
          access end-user Google accounts.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Contact</h2>
        <p>
          <a
            href={`mailto:${supportEmail}`}
            className="text-blue-600 hover:underline"
          >
            {supportEmail}
          </a>
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Related Policies</h2>
        <p>
          <Link href="/privacy-policy" className="text-blue-600 hover:underline">
            Privacy Policy
          </Link>
          {' · '}
          <Link href="/terms" className="text-blue-600 hover:underline">
            Terms of Service
          </Link>
        </p>
      </section>
    </div>
  );
}
