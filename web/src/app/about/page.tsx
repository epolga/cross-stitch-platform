import type { Metadata } from 'next';
import Link from 'next/link';
import { buildCanonicalUrl } from '@/lib/url-helper';

export const dynamic = 'force-dynamic';

const PAGE_PATH = '/about';
const TITLE = 'About Ann Logan — Who Designs These Cross-Stitch Patterns';
const DESCRIPTION =
  'Cross-Stitch.com is designed and run by Ann Logan, a cross-stitch designer based in Prague. Read why the site exists, how the patterns are made, and how to get in touch.';

export async function generateMetadata(): Promise<Metadata> {
  const canonicalUrl = buildCanonicalUrl(PAGE_PATH);
  return {
    title: TITLE,
    description: DESCRIPTION,
    keywords: 'about cross stitch patterns, Ann Logan, who makes these cross stitch charts, cross stitch designer Prague',
    alternates: { canonical: canonicalUrl },
    robots: 'index, follow',
    openGraph: { title: TITLE, description: DESCRIPTION, url: canonicalUrl, type: 'website' },
    twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
  };
}

export default function AboutPage() {
  const canonicalUrl = buildCanonicalUrl(PAGE_PATH);

  const personStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Ann Logan',
    jobTitle: 'Cross-Stitch Pattern Designer',
    email: 'ann@cross-stitch.com',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Krivoklatska 271',
      addressLocality: 'Praha',
      postalCode: '19900',
      addressCountry: 'CZ',
    },
    url: canonicalUrl,
    worksFor: {
      '@type': 'Organization',
      name: 'Cross-Stitch.com',
      url: buildCanonicalUrl('/'),
      foundingDate: '2008',
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personStructuredData) }} />
      <div className="container mx-auto p-4 max-w-2xl">
        <h1 className="text-3xl font-bold mb-2">About Ann Logan</h1>
        <p className="text-gray-500 text-sm mb-6">Cross-stitch designer · Prague, Czech Republic · running Cross-Stitch.com since 2008</p>

        <div className="prose prose-sm sm:prose-base max-w-none text-gray-800 space-y-4">
          <p>
            Built by a cross-stitch designer who has spent more hours than she&apos;d like to admit counting stitches
            from a paper chart. That designer is me — Ann Logan — and this page exists because people keep asking
            who&apos;s actually behind the patterns.
          </p>

          <h2 className="text-xl font-semibold pt-2">Why this site exists</h2>
          <p>
            I learned to stitch as a child, taught by my grandmother, Milena, and I&apos;ve been working through her
            old, mostly unlabeled stash of DMC floss ever since. For most of my career I was a primary-school art
            teacher; cross-stitch was always the thing I did for myself, not for work.
          </p>
          <p>
            I started sharing my patterns online in 2008, originally at cross-stitch-pattern.net, and later moved
            the whole catalog to this shorter, easier-to-remember domain.
          </p>
          <p>
            A few years ago mild arthritis started making the old way of stitching — squinting at a small paper
            chart, holding pages flat, losing my place in the grid — genuinely painful during long sessions. That&apos;s
            what pushed the site beyond a simple pattern catalog into the online editor it has today: a large,
            adjustable screen instead of a paper chart, no need to hold anything flat, easy to pause and pick back
            up, and a way to hide colors you&apos;ve already stitched so your eyes don&apos;t have to hunt for your
            place.
          </p>

          <h2 className="text-xl font-semibold pt-2">What I actually do here</h2>
          <p>
            I design and curate every chart in the catalog myself, publish new patterns regularly, and build the
            tools on the site — including the{' '}
            <Link href="/photo-to-cross-stitch" className="text-blue-600 hover:underline">
              free online pattern editor
            </Link>{' '}
            that turns your own photos into stitchable charts. Every pattern includes a full DMC color key and stitch
            count, checked by someone who actually stitches, not just generates and publishes.
          </p>

          <h2 className="text-xl font-semibold pt-2">Home, when I&apos;m not designing</h2>
          <p>
            I live in Prague with my husband, Tomáš, a retired engineer who built my first tablet stand for the
            hoop, and our cat, Nitka (&quot;little thread&quot; in Czech) — a rescued stray with a real talent for
            napping on exactly the part of the fabric I need next. The{' '}
            <Link href="/Black-Cat-15-210-Free-Design.aspx" className="text-blue-600 hover:underline">
              &quot;Black Cat&quot; pattern
            </Link>{' '}
            in the Cats collection was designed in her honor. My daughter, Klára, learned to stitch from me as a
            teenager and still sends me photos of her own finished pieces.
          </p>

          <h2 className="text-xl font-semibold pt-2">Get in touch</h2>
          <p>
            Questions, feedback, or a pattern request — email me directly at{' '}
            <a href="mailto:ann@cross-stitch.com" className="text-blue-600 hover:underline">
              ann@cross-stitch.com
            </a>
            . I read everything myself.
          </p>
        </div>

        <p className="mt-8 text-sm text-gray-600">
          Browse{' '}
          <Link href="/XStitch-Charts.aspx" className="text-blue-600 hover:underline">
            all free cross-stitch albums
          </Link>{' '}
          or see the{' '}
          <Link href="/tutorial" className="text-blue-600 hover:underline">
            editor guide
          </Link>
          .
        </p>
      </div>
    </>
  );
}
