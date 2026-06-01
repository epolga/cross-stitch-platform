import type { Metadata } from 'next';
import Link from 'next/link';
import { buildSiteEmail } from '@/lib/url-helper';

export const metadata: Metadata = {
  title: 'Terms of Service | Cross Stitch Pattern',
  description: 'Terms governing use of Cross Stitch Pattern and CrossStitchUploader.',
  robots: 'index, follow',
};

const supportEmail = buildSiteEmail('ann');

export default function TermsPage() {
  return (
    <div className="container mx-auto max-w-4xl p-4 space-y-6">
      <h1 className="text-3xl font-bold text-center">Terms of Service</h1>

      <p>Effective date: February 20, 2026</p>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">1. Scope</h2>
        <p>
          These terms apply to your use of Cross Stitch Pattern and
          CrossStitchUploader. By using this site or related services, you agree
          to these terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">2. Accounts and Security</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>You are responsible for your account credentials and activity.</li>
          <li>You must provide accurate account information.</li>
          <li>
            We may suspend or terminate access for abuse, fraud, or policy
            violations.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">3. Acceptable Use</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>No unlawful use, scraping abuse, or service disruption attempts.</li>
          <li>No unauthorized access or security testing without permission.</li>
          <li>
            You must comply with applicable platform policies, including Etsy API
            requirements where relevant.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">4. Payments and Subscriptions</h2>
        <p>
          Paid features are billed through third-party payment providers.
          Subscription terms, billing cycles, and cancellation controls are shown
          at checkout.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">5. Required Etsy API Disclaimer</h2>
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
          ETSY API and any information provided by Etsy in connection therewith
          are provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis,
          without warranties or conditions of any kind, express, implied or
          statutory. ETSY SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTIES OF
          TITLE, MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
          NON-INFRINGEMENT.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">6. Etsy Trademark Notice</h2>
        <p>
          The term &quot;Etsy&quot; is a trademark of Etsy, Inc. This
          application uses the Etsy API but is not endorsed or certified by Etsy,
          Inc.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">7. Liability Limits</h2>
        <p>
          To the fullest extent permitted by law, we are not liable for indirect,
          incidental, special, consequential, or punitive damages arising from
          use of the service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">8. Related Policies</h2>
        <p>
          Please review our{' '}
          <Link href="/privacy-policy" className="text-blue-600 hover:underline">
            Privacy Policy
          </Link>{' '}
          for details on data handling.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">9. Contact</h2>
        <p>
          Questions about these terms can be sent to{' '}
          <a
            href={`mailto:${supportEmail}`}
            className="text-blue-600 hover:underline"
          >
            {supportEmail}
          </a>
          .
        </p>
      </section>
    </div>
  );
}
