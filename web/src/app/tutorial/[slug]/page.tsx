import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildCanonicalUrl } from '@/lib/url-helper';
import { tutorials, getTutorial, type TutorialGuide } from '@/lib/tutorial-data';

const IMAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '/tutorial/editor-overview.png': { width: 1217, height: 993 },
  '/tutorial/import-from-photo.png': { width: 481, height: 688 },
  '/tutorial/drawing-toolbar.png': { width: 1017, height: 55 },
  '/tutorial/select-tool.png': { width: 1217, height: 993 },
  '/tutorial/palette-panel.png': { width: 139, height: 827 },
  '/tutorial/stitch-mode.png': { width: 1217, height: 994 },
  '/tutorial/save-dialog.png': { width: 421, height: 200 },
};

function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return tutorials.map(t => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = getTutorial(slug);
  if (!guide) return {};

  const imageDims = guide.image ? IMAGE_DIMENSIONS[guide.image.src] : undefined;
  const ogImage = guide.image && imageDims
    ? [{ url: buildCanonicalUrl(guide.image.src), width: imageDims.width, height: imageDims.height, alt: guide.image.alt }]
    : undefined;

  return {
    title: `${guide.h1} | Cross-Stitch.com Editor Guide`,
    description: guide.metaDescription,
    keywords: `${guide.title}, cross stitch editor tutorial, how to use cross stitch pattern maker`,
    alternates: { canonical: buildCanonicalUrl(`/tutorial/${guide.slug}`) },
    robots: 'index, follow',
    openGraph: {
      title: guide.h1,
      description: guide.metaDescription,
      url: buildCanonicalUrl(`/tutorial/${guide.slug}`),
      type: 'article',
      images: ogImage,
    },
    twitter: {
      card: 'summary_large_image',
      title: guide.h1,
      description: guide.metaDescription,
      images: ogImage?.map(img => img.url),
    },
  };
}

function GuideLinkList({ heading, guides }: { heading: string; guides: TutorialGuide[] }) {
  if (guides.length === 0) return null;
  return (
    <section>
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{heading}</h2>
      <div className="flex flex-wrap gap-2 lg:flex-col lg:gap-1.5 lg:items-start">
        {guides.map(g => (
          <Link
            key={g.slug}
            href={`/tutorial/${g.slug}`}
            className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 hover:border-rose-300 hover:text-rose-600 transition-colors lg:w-full lg:border-0 lg:bg-transparent lg:px-0 lg:py-0.5"
          >
            {g.title}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function TutorialGuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = getTutorial(slug);
  if (!guide) notFound();

  const faqStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: guide.faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  const howToStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: guide.h1,
    description: guide.metaDescription,
    image: guide.image ? buildCanonicalUrl(guide.image.src) : undefined,
    datePublished: guide.updatedDate,
    dateModified: guide.updatedDate,
    step: guide.sections.map((section, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: section.heading,
      text: section.paragraphs.join(' '),
      url: `${buildCanonicalUrl(`/tutorial/${guide.slug}`)}#${slugify(section.heading)}`,
    })),
  };

  const breadcrumbStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Editor Guide', item: buildCanonicalUrl('/tutorial') },
      { '@type': 'ListItem', position: 2, name: guide.title, item: buildCanonicalUrl(`/tutorial/${guide.slug}`) },
    ],
  };

  const otherGuides = tutorials.filter(t => t.slug !== guide.slug && t.category === guide.category);
  const moreGuides = tutorials.filter(t => t.slug !== guide.slug && t.category !== guide.category);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbStructuredData) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToStructuredData) }} />
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-8 lg:grid lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-10 lg:items-start">
          <div className="max-w-3xl">
            <p className="text-xs text-gray-400 mb-2">
              <Link href="/tutorial" className="hover:text-rose-600 hover:underline">Editor Guide</Link>
              {' / '}{guide.category}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 leading-snug">{guide.h1}</h1>
            <p className="text-gray-600 mb-8">{guide.intro}</p>

            {guide.image && IMAGE_DIMENSIONS[guide.image.src] && (
              <div className="mb-8 bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex justify-center">
                <Image
                  src={guide.image.src}
                  alt={guide.image.alt}
                  width={IMAGE_DIMENSIONS[guide.image.src].width}
                  height={IMAGE_DIMENSIONS[guide.image.src].height}
                  priority
                  className="w-auto h-auto max-w-full max-h-[520px] rounded-lg"
                />
              </div>
            )}

            <div className="space-y-6 mb-10">
              {guide.sections.map(section => (
                <section key={section.heading} id={slugify(section.heading)} className="scroll-mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">{section.heading}</h2>
                  <div className="space-y-3">
                    {section.paragraphs.map((p, i) => (
                      <p key={i} className="text-sm text-gray-600 leading-relaxed">{p}</p>
                    ))}
                    {section.list && (
                      <ul className="list-disc pl-5 space-y-1.5">
                        {section.list.map((item, i) => (
                          <li key={i} className="text-sm text-gray-600 leading-relaxed">{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              ))}
            </div>

            <section className="mb-10 bg-rose-50 border border-rose-200 rounded-xl p-6">
              <p className="text-sm text-gray-700 leading-relaxed mb-4">Ready to try it in the editor?</p>
              <Link
                href="/photo-to-cross-stitch"
                className="inline-block bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                Open the editor →
              </Link>
            </section>

            <section className="mb-10 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-5">Frequently asked questions</h2>
              <dl className="space-y-4">
                {guide.faq.map(({ q, a }) => (
                  <div key={q}>
                    <dt className="font-semibold text-gray-800 text-sm">{q}</dt>
                    <dd className="mt-1 text-gray-600 text-sm leading-relaxed">{a}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <div className="space-y-6 mb-6 lg:hidden">
              <GuideLinkList heading={`More in ${guide.category}`} guides={otherGuides} />
              <GuideLinkList heading="Other guides" guides={moreGuides} />
            </div>

            <p className="text-xs text-gray-400 mt-8">Last updated {guide.updatedDate}.</p>
          </div>

          <aside className="hidden lg:block sticky top-8 space-y-8">
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">On this page</h2>
              <ul className="space-y-1.5 text-sm border-l border-gray-200">
                {guide.sections.map(section => (
                  <li key={section.heading}>
                    <a
                      href={`#${slugify(section.heading)}`}
                      className="block pl-3 -ml-px border-l-2 border-transparent text-gray-500 hover:text-rose-600 hover:border-rose-300 transition-colors"
                    >
                      {section.heading}
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            <GuideLinkList heading={`More in ${guide.category}`} guides={otherGuides} />
            <GuideLinkList heading="Other guides" guides={moreGuides} />
          </aside>
        </div>
      </div>
    </>
  );
}
