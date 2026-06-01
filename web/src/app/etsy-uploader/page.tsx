import type { Metadata } from 'next';
import Link from 'next/link';
import { buildCanonicalUrl, buildSiteEmail } from '@/lib/url-helper';

const canonicalUrl = buildCanonicalUrl('/etsy-uploader');
const supportEmail = buildSiteEmail('ann');

export const metadata: Metadata = {
  title: 'CrossStitchUploader | Etsy API Access',
  description:
    'Public information page for Etsy Open API review of CrossStitchUploader.',
  alternates: {
    canonical: canonicalUrl,
  },
  robots: 'index, follow',
};

export default function EtsyUploaderPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">CrossStitchUploader</h1>
        <p className="text-gray-700">
          CrossStitchUploader is a seller tool used to manage and publish
          cross-stitch listing data for our own Etsy workflow.
        </p>
        <p className="text-sm text-gray-600">
          Last updated: February 20, 2026
        </p>
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
        <h2 className="text-xl font-semibold text-gray-900">
          What This App Does
        </h2>
        <p className="text-gray-800">
          The app prepares listing data, helps organize titles and tags, and
          supports creating or updating listings through Etsy API endpoints for
          legitimate seller operations.
        </p>
        <ul className="list-disc list-inside text-gray-800 space-y-1">
          <li>Creates and updates listing drafts.</li>
          <li>Manages listing metadata used in our shop workflow.</li>
          <li>Supports normal seller-side catalog maintenance.</li>
        </ul>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
        <h2 className="text-xl font-semibold text-gray-900">Who Uses It</h2>
        <p className="text-gray-800">
          This tool is operated for our own seller activity and internal team
          workflow only.
        </p>
        <ul className="list-disc list-inside text-gray-800 space-y-1">
          <li>Business: CrossStitchUploader</li>
          <li>Primary contact: {supportEmail}</li>
          <li>End users: internal seller workflow, not a public marketplace app</li>
        </ul>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
        <h2 className="text-xl font-semibold text-gray-900">
          Policy and Data Handling
        </h2>
        <ul className="list-disc list-inside text-gray-800 space-y-1">
          <li>No scraping, spamming, or buyer messaging automation.</li>
          <li>No resale of personal data.</li>
          <li>Only minimum data required for listing management is used.</li>
          <li>Etsy rate limits and developer policies are respected.</li>
        </ul>
        <p className="text-gray-800">
          Privacy policy:{' '}
          <Link
            href="/privacy-policy"
            className="text-blue-600 hover:underline"
          >
            https://cross-stitch.com/privacy-policy
          </Link>
        </p>
        <p className="text-gray-800">
          Terms of service:{' '}
          <Link href="/terms" className="text-blue-600 hover:underline">
            https://cross-stitch.com/terms
          </Link>
        </p>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
        <h2 className="text-xl font-semibold text-gray-900">
          Public Product Links
        </h2>
        <ul className="list-disc list-inside text-gray-800 space-y-1">
          <li>
            Homepage:{' '}
            <Link href="/" className="text-blue-600 hover:underline">
              https://cross-stitch.com/
            </Link>
          </li>
          <li>
            Example category page:{' '}
            <Link
              href="/Free-Animals-Charts.aspx"
              className="text-blue-600 hover:underline"
            >
              https://cross-stitch.com/Free-Animals-Charts.aspx
            </Link>
          </li>
          <li>
            Example product page:{' '}
            <Link
              href="/Baby-7-52-Free-Design.aspx"
              className="text-blue-600 hover:underline"
            >
              https://cross-stitch.com/Baby-7-52-Free-Design.aspx
            </Link>
          </li>
        </ul>
      </section>

      <section className="rounded-lg border border-amber-300 bg-amber-50 p-5">
        <p className="text-amber-900 font-medium">
          The term &quot;Etsy&quot; is a trademark of Etsy, Inc. This
          application uses the Etsy API but is not endorsed or certified by
          Etsy, Inc.
        </p>
      </section>
    </div>
  );
}
