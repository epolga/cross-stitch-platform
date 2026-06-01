// app/privacy-policy/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import React from 'react';
import { buildSiteEmail } from '@/lib/url-helper';

export const metadata: Metadata = {
  title: 'Privacy Policy | Cross Stitch Pattern',
  description:
    'How Cross Stitch Pattern collects, uses, stores, and protects personal information.',
  robots: 'index, follow',
};

const supportEmail = buildSiteEmail('ann');

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto max-w-4xl p-4 space-y-6">
      <h1 className="text-3xl font-bold text-center">Privacy Policy</h1>

      <p>Last updated: February 20, 2026</p>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Who We Are</h2>
        <p>
          This policy applies to Cross Stitch Pattern and CrossStitchUploader
          (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) and explains how we process personal data when
          you use our website and related seller tools.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Data We Collect</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Account data: email, first name, and account preferences.</li>
          <li>
            Authentication data: password credentials and reset tokens used to
            authenticate your account.
          </li>
          <li>
            Subscription and trial data: plan IDs, subscription status, trial
            usage, and related timestamps.
          </li>
          <li>
            Technical and usage data: IP address, user agent, request metadata,
            and page interaction diagnostics.
          </li>
          <li>
            Browser storage and tracking data: cookies, local storage flags, and
            analytics/advertising events.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">How We Use Data</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Provide account access and downloadable design services.</li>
          <li>Process subscriptions, free trials, and support requests.</li>
          <li>Maintain security, detect abuse, and troubleshoot incidents.</li>
          <li>Operate analytics, service reliability, and product improvements.</li>
          <li>Send transactional messages and optional updates you request.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Etsy API Data Handling</h2>
        <p>
          For Etsy API integrations, we access and process seller data only for
          legitimate seller operations authorized by the account owner, such as
          listing management workflows.
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>We do not scrape Etsy pages.</li>
          <li>We do not send spam or automate buyer messaging.</li>
          <li>We do not sell Etsy-related personal data.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Sharing and Processors</h2>
        <p>
          We share data only when needed to operate the service, including
          infrastructure, payments, and communications providers.
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Cloud hosting and storage providers (for example AWS).</li>
          <li>Payment providers (for example PayPal for subscriptions).</li>
          <li>Analytics and advertising providers where enabled.</li>
          <li>Authorities when required by law.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Retention and Security</h2>
        <p>
          We keep personal data only as long as needed for service operations,
          legal obligations, dispute resolution, and fraud prevention.
        </p>
        <p>
          We use reasonable technical and organizational safeguards. No Internet
          or storage system can be guaranteed 100% secure.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Your Choices and Rights</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>You can request access, correction, or deletion of your data.</li>
          <li>You can opt out of optional update emails.</li>
          <li>
            You can request account assistance by contacting{' '}
            <a
              href={`mailto:${supportEmail}`}
              className="text-blue-600 hover:underline"
            >
              {supportEmail}
            </a>
            .
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Do Not Track (DNT)</h2>
        <p>
          If your browser sends <code>DNT: 1</code> or Global Privacy Control
          (<code>Sec-GPC: 1</code>), we disable Google Analytics and AdSense
          script loading for that request.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Children</h2>
        <p>
          Our service is not directed to children under 13, and we do not
          knowingly collect personal data from children under 13.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Related Terms</h2>
        <p>
          Please also review our{' '}
          <Link href="/terms" className="text-blue-600 hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Contact Us</h2>
        <p>
          If you have privacy questions or requests, contact us at{' '}
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
