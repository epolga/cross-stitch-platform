import type { Metadata } from 'next';
import Link from 'next/link';
import { buildCanonicalUrl } from '@/lib/url-helper';

const tipSections = [
  {
    title: 'Gather Essential Tools',
    body: `Start with a handful of needles, a small pair of embroidery scissors, and an embroidery hoop that fits your project.
    Keeping the fabric taut and the thread trimmed neatly prevents tangles and makes each stitch more accurate.`,
  },
  {
    title: 'Choose the Right Fabric',
    body: `Aida cloth is perfect for beginners because the visible grid makes counting simple. As you build confidence,
    experiment with evenweave or linen to achieve finer detail. Always match your needle size to the fabric count to avoid enlarged holes.`,
  },
  {
    title: 'Master Thread Management',
    body: `Separate your floss strands before stitching to keep the coverage even. Use shorter lengths of thread (about 18 inches)
    to reduce wear and knotting, and consider bobbins or floss drops to organize colors for larger projects.`,
  },
  {
    title: 'Follow a Stitching Rhythm',
    body: `Work in rows or small blocks, completing each cross fully before moving on. This habit keeps the backside tidy,
    makes counting easier, and helps you spot mistakes quickly without ripping out large sections.`,
  },
  {
    title: 'Finish and Display with Confidence',
    body: `Gently wash completed pieces in lukewarm water with mild soap, then lay flat between towels to dry.
    Press the fabric face-down on a towel using a low iron to protect stitches before framing or gifting.`,
  },
];

const canonicalUrl = buildCanonicalUrl('/CrossStitchTips.aspx');

export const metadata: Metadata = {
  title: 'Cross-Stitch Tips & Techniques Guide | Free Stitching Advice',
  description:
    'Practical cross-stitch tips on tools, fabric selection, thread management, stitching rhythm, and finishing for polished results.',
  keywords: ['cross stitch tips', 'embroidery techniques', 'aida fabric advice', 'beginner stitching tips'],
  alternates: {
    canonical: canonicalUrl,
  },
  openGraph: {
    title: 'Cross-Stitch Tips & Techniques Guide | Free Stitching Advice',
    description:
      'Guidance on tools, fabric, thread management, and finishing touches to elevate your free cross-stitch projects.',
    url: canonicalUrl,
    type: 'article',
  },
  twitter: {
    card: 'summary',
    title: 'Cross-Stitch Tips & Techniques Guide | Free Stitching Advice',
    description: 'Helpful cross-stitch tips for beginners and seasoned stitchers alike.',
  },
  other: {
    'application/ld+json': JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Cross-Stitch Tips & Techniques Guide | Free Stitching Advice',
      description:
        'Guidance on essential tools, fabric choices, thread management, stitching rhythm, and finishing steps for successful cross-stitching.',
      author: {
        '@type': 'Person',
        name: 'Ann',
      },
      url: canonicalUrl,
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': canonicalUrl,
      },
    }),
  },
};

export default function CrossStitchTipsPage() {
  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-4 text-center">Cross-Stitch Tips &amp; Techniques Guide</h1>
      <p className="text-lg text-gray-700 mb-6 text-center">
        Whether you are threading your first needle or polishing advanced skills, these practical cross-stitch tips
        will help you create neat, professional results.
      </p>

      <section className="space-y-6">
        {tipSections.map((tip) => (
          <article key={tip.title} className="bg-white shadow rounded-lg p-5 border border-gray-200">
            <h2 className="text-2xl font-semibold mb-2">{tip.title}</h2>
            <p className="text-gray-700 leading-relaxed whitespace-pre-line">{tip.body}</p>
          </article>
        ))}
      </section>

      <div className="mt-10 space-y-4 text-gray-800">
        <p>
          Ready to put these tips to work? Browse the{' '}
          <Link href="/XStitch-Charts.aspx" className="text-blue-600 hover:underline">
            latest free cross-stitch charts
          </Link>{' '}
          and download a PDF pattern that inspires you today.
        </p>
        <p>
          Need a refresher on account or download questions? Visit our{' '}
          <Link href="/" className="text-blue-600 hover:underline">
            FAQ on the homepage
          </Link>{' '}
          for quick answers.
        </p>
      </div>
    </main>
  );
}
