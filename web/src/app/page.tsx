import { DesignListWrapper } from '@/app/components/DesignListWrapper';
import SearchForm from '@/app/components/SearchForm';
import { fetchFilteredDesigns, updateLastEmailEntryByCid } from '@/lib/data-access';
import type { Metadata } from 'next';
import Link from 'next/link';
import RegisterNewsletterLink from '@/app/components/RegisterNewsletterLink';
import { updateLastEmailEntryInUsersTable } from '@/lib/users';
import { buildCanonicalUrl } from '@/lib/url-helper';
import { isPaidDownloadMode } from '@/lib/download-mode';
import AdSlot from '@/app/components/AdSlot';

export const dynamic = 'force-dynamic';

type FAQEntry = {
  question: string;
  answer: string;
  ctaHref?: string;
  ctaLabel?: string;
};

const faqEntries: FAQEntry[] = [
  {
    question: 'Are the cross-stitch patterns really free?',
    answer:
      'Yes. Every chart on Cross Stitch Pattern is offered as a free PDF so you can stitch without paying subscriptions or hidden fees.',
  },
  {
    question: 'Do I need to create an account to download the PDFs?',
    answer:
      'You only need a free account so the site can deliver each PDF instantly and unlock repeat downloads from any device.',
  },
  {
    question: 'Are the patterns suitable for beginners?',
    answer:
      'Absolutely. Each listing shows the stitch count and color count so newcomers can pick manageable projects and progress to larger heirloom pieces.',
  },
  {
    question: 'How often do you publish new designs?',
    answer:
      'Fresh cross-stitch PDFs are added several times a week and newsletter subscribers are the first to know when new designs go live.',
  },
  {
    question: 'Where can I browse themed collections?',
    answer: 'Use the themed collections to jump straight into animals, holidays, florals, landscapes, and more.',
    ctaHref: '/XStitch-Charts.aspx',
    ctaLabel: 'Browse the XStitch Charts page',
  },
  {
    question: 'Where can I learn more cross-stitch techniques?',
    answer:
      'The dedicated tips page covers fabric choices, thread management, finishing techniques, and more detailed how-tos for every level.',
    ctaHref: '/CrossStitchTips.aspx',
    ctaLabel: 'Read the cross-stitch tips guide',
  },
  {
    question: 'Can I print the charts at home?',
    answer:
      'Yes. Every PDF is formatted for standard letter or A4 pages so you can print from home or view the chart on a tablet without extra software.',
  },
];

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const resolvedSearchParams = await searchParams;
  const nPage = parseInt(resolvedSearchParams?.nPage?.toString() || '1', 10);
  const pageSize = parseInt(resolvedSearchParams?.pageSize?.toString() || '20', 10);
  const searchText = resolvedSearchParams?.searchText?.toString() || '';

  const filters = {
    widthFrom: parseInt(resolvedSearchParams?.widthFrom?.toString() || '0', 10),
    widthTo: parseInt(resolvedSearchParams?.widthTo?.toString() || '10000', 10),
    heightFrom: parseInt(resolvedSearchParams?.heightFrom?.toString() || '0', 10),
    heightTo: parseInt(resolvedSearchParams?.heightTo?.toString() || '10000', 10),
    ncolorsFrom: parseInt(resolvedSearchParams?.ncolorsFrom?.toString() || '0', 10),
    ncolorsTo: parseInt(resolvedSearchParams?.ncolorsTo?.toString() || '10000', 10),
    nPage,
    pageSize,
    searchText,
  };

  let designs;
  try {
    ({ designs } = await fetchFilteredDesigns(filters));
  } catch (error) {
    console.error('Error fetching designs for metadata:', error);
    return {
      title: 'Cross Stitch Designs',
      description: 'Explore thousands of free cross-stitch designs with downloadable PDF patterns ready for instant download.',
    };
  }

  const ogImage = designs[0]?.ImageUrl || 'https://d2o1uvvg91z7o4.cloudfront.net/images/default.jpg';
  const canonicalUrl = buildCanonicalUrl('/');
  const title = searchText ? `Search Results for "${searchText}" - Cross Stitch Designs` : 'Cross Stitch Designs';
  const description = searchText 
    ? `Search results for "${searchText}". Explore thousands of free cross-stitch PDF patterns with instant downloads.` 
    : 'Explore thousands of free cross-stitch PDF patterns with instant downloads.';

  const websiteStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Cross Stitch Pattern",
    "description": description,
    "url": canonicalUrl,
    "potentialAction": {
      "@type": "SearchAction",
      "target": `${canonicalUrl}?searchText={search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  };

  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqEntries.map((item) => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.answer,
      },
    })),
  };

  return {
    title,
    description,
    keywords: 'cross stitch, free designs, free patterns, free PDF embroidery charts',
    alternates: {
      canonical: canonicalUrl,
    },
    robots: 'index, follow',
    openGraph: {
      title,
      description,
      images: ogImage,
      url: canonicalUrl,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ogImage,
    },
    other: {
      'application/ld+json': JSON.stringify([websiteStructuredData, faqStructuredData]),
    },
  };
}

export default async function Home({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const nPage = parseInt(resolvedSearchParams?.nPage?.toString() || '1', 10);
  const pageSize = parseInt(resolvedSearchParams?.pageSize?.toString() || '20', 10);
  const searchText = resolvedSearchParams?.searchText?.toString() || '';
  const eid = resolvedSearchParams?.eid?.toString() || '';
  const cid = resolvedSearchParams?.cid?.toString() || '';
  const source = resolvedSearchParams?.from?.toString() || '';
  const showProfileLogoutNotice = source === 'profile-logout';
  const adsEnabled = !isPaidDownloadMode();
  const adSlotTop =
    process.env.NEXT_PUBLIC_AD_SLOT_HOME_TOP ??
    process.env.NEXT_PUBLIC_AD_SLOT_DESIGN_TOP ??
    '';
  const adSlotBottom =
    process.env.NEXT_PUBLIC_AD_SLOT_HOME_BOTTOM ??
    process.env.NEXT_PUBLIC_AD_SLOT_DESIGN_BOTTOM ??
    '';

  console.log("Home page accessed with eid:", eid, "and cid:", cid);
  if (eid && cid) {
    try {
      await Promise.all([
        updateLastEmailEntryByCid(cid),
        updateLastEmailEntryInUsersTable(cid),
      ]);
    } catch (error) {
      console.error('Failed to update LastEmailEntry for root email entry:', error);
    }
  }

  const filters = {
    widthFrom: parseInt(resolvedSearchParams?.widthFrom?.toString() || '0', 10),
    widthTo: parseInt(resolvedSearchParams?.widthTo?.toString() || '10000', 10),
    heightFrom: parseInt(resolvedSearchParams?.heightFrom?.toString() || '0', 10),
    heightTo: parseInt(resolvedSearchParams?.heightTo?.toString() || '10000', 10),
    ncolorsFrom: parseInt(resolvedSearchParams?.ncolorsFrom?.toString() || '0', 10),
    ncolorsTo: parseInt(resolvedSearchParams?.ncolorsTo?.toString() || '10000', 10),
    nPage,
    pageSize,
    searchText,
  };

  let designs, totalPages;
  try {
    ({ designs, totalPages } = await fetchFilteredDesigns(filters));
  } catch (error) {
    console.error('Error fetching designs:', error);
    return (
      <div className="p-4">
        <p className="text-red-500">
          Error loading designs: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:pl-64 md:pr-4 relative">
      <div className="hidden md:block fixed left-4 top-1/2 -translate-y-1/2 z-20 w-56">
        <SearchForm />
      </div>
      <div className="w-full">
          <h1 className="text-3xl font-bold mb-4 text-gray-900">
            Free Cross-Stitch PDF Patterns
          </h1>
          {showProfileLogoutNotice && (
            <div
              className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm"
              role="status"
            >
              You have been logged out. The private voting page is only available while you are signed in.
            </div>
          )}
          <p className="text-gray-700 mb-6">
            Browse hundreds of free downloadable charts, filter by size or colors, and find your next stitching project.
          </p>
          {adsEnabled && adSlotTop && (
            <div className="my-4">
              <AdSlot slot={adSlotTop} minHeight={250} minHeightDesktop={280} />
            </div>
          )}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-6">
            <p className="text-gray-800">
              All charts here are full, printable PDFs with color keys and stitch counts. Every listing includes stitch width, height,
              and color totals so you can judge effort quickly. New patterns are published weekly and older designs stay free forever,
              making this library a reliable place to bookmark for future projects.
            </p>
          </div>
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-6 space-y-3">
            <h2 className="text-xl font-semibold text-gray-900">How to use the filters</h2>
            <p className="text-gray-800">
              Pick width and height ranges to match your fabric and hoop, and narrow colors to keep floss costs in check.
              Searching for subjects works too: try &quot;cats, winter&quot; to see themed results in one pass.
            </p>
            <p className="text-gray-800">
              When you find a design you like, open it to see stitch count, palette size, and the PDF download link. You can always
              change filters and return to the same page of results—pagination keeps your place.
            </p>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Getting started checklist</h3>
              <ul className="list-disc list-inside text-gray-800 space-y-1">
                <li>Set your stitch count range to match your preferred project size.</li>
                <li>Limit color count if you want faster stitching or minimal floss purchases.</li>
                <li>Use search terms for themes (e.g., animals, holidays, florals, landscapes).</li>
                <li>Open a design to confirm the stitch count and download the PDF chart.</li>
                <li>Save favorites and come back—new free designs are added weekly.</li>
              </ul>
            </div>
          </section>
          <div id="results">
            <DesignListWrapper
              designs={designs}
              page={nPage}
              totalPages={totalPages}
              pageSize={pageSize}
              baseUrl="/"
            />
          </div>
          {adsEnabled && adSlotBottom && (
            <div className="my-6">
              <AdSlot slot={adSlotBottom} minHeight={250} minHeightDesktop={280} />
            </div>
          )}
          <div className="mt-8 prose max-w-none bg-white p-6 rounded-lg shadow-lg">
            <p>My name is Ann, and I am delighted to welcome you here!</p>

            <h2>Free Cross-Stitch PDF Patterns for Every Stitcher</h2>
            <p>
              For many years, I have been creating counted cross-stitch patterns for myself and others.
              Now, I am thrilled to share these free designs with you. I am confident you will enjoy them
              as much as my friends do. All my patterns, designs, and charts are meticulously crafted to
              simplify your stitching experience.
            </p>

            <h3>Why Counted Cross-Stitch Still Inspires Me</h3>
            <p>
              Counted cross-stitch is one of the world&apos;s most beloved hobbies. It is simple to learn and execute - 
              essentially embroidery using small crosses to form stunning, memorable designs. Often called &quot;counted cross-stitch,&quot;
              this craft requires precise counting of stitches on the fabric to ensure accurate placement. I personally adore cross-stitching
              and view it as a form of meditation; the rhythmic process - stitch by stitch - is incredibly soothing and calming.
            </p>

            <h3>Creative Possibilities</h3>
            <p>
              The possibilities are endless. You can adorn your home, gift your work to loved ones, or simply enjoy the process
              for personal fulfillment. My collection includes seasonal sets, floral themes, animals, landscapes, and beginner-friendly
              mini designs so you can always find the perfect project.
            </p>

            <h3>What You Need to Start Stitching</h3>
            <p>
              Getting started is straightforward. Unlike many crafts, cross-stitch requires minimal supplies: primarily a needle and thread.
              If you are new to cross-stitching, begin with a small, simple design and gradually advance to more complex projects.
            </p>
            <p>
              Online shops today offer an extensive range of fabrics and threads. I favor Aida fabric for its ease of use and maintenance.
              Woven with threads grouped into bundles, Aida features small holes that guide the needle effortlessly. Fabric count determines
              the size and overall look of your project, so ensure your needles match the fabric count.
            </p>
            <p>
              For threads, options abound, including Anchor and Madeira. I prefer DMC floss for its quality. Patterns typically specify colors,
              and I advise following them closely. Subtle shade variations add depth to the design, even if they are not immediately noticeable.
              Essential tools include embroidery hoops and scissors. Hoops keep the fabric taut and flat, easing the stitching process - though
              some stitchers prefer working without them.
            </p>

            <h3>Find Your Next Free Pattern</h3>
            <p>
              My galleries feature hundreds of free cross-stitch designs, with new ones added nearly every day. Newsletter subscribers receive
              fresh free designs every few days. Explore my albums from this page to find the perfect free chart, and use the search box to locate
              free patterns: enter comma-separated terms (e.g., cats, birds, dogs).
            </p>
            <RegisterNewsletterLink />

            <h3>Popular Free Pattern Topics</h3>
            <ul>
              <li>Seasonal cross-stitch PDFs such as Christmas and Halloween motifs</li>
              <li>Animal-themed embroidery charts featuring cats, birds, and woodland creatures</li>
              <li>Landscape scenes with detailed color blends and shading</li>
              <li>Beginner-friendly mini patterns that stitch quickly</li>
              <li>Large-format heirloom charts for experienced stitchers</li>
            </ul>

            <p>Happy stitching!</p>

            <section className="mt-10">
              <h3>Frequently Asked Questions</h3>
              <dl className="space-y-4">
                {faqEntries.map((item) => (
                  <div key={item.question}>
                    <dt className="font-semibold">{item.question}</dt>
                    <dd className="text-gray-700">
                      <p>{item.answer}</p>
                      {item.ctaHref ? (
                        <p className="mt-1">
                          <Link href={item.ctaHref} className="text-blue-600 hover:underline">
                            {item.ctaLabel ?? 'Learn more'}
                          </Link>
                        </p>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
      </div>
    </div>
  );
}
