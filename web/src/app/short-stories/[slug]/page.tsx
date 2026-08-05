import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildCanonicalUrl } from '@/lib/url-helper';
import { getBlogPost, getSortedBlogPosts } from '@/lib/blog-posts';
import BlogPostArticle from '@/app/components/BlogPostArticle';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getSortedBlogPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};

  return {
    title: `${post.title} | Between Stitches`,
    description: post.excerpt,
    keywords: post.keywords,
    alternates: {
      canonical: buildCanonicalUrl(`/short-stories/${post.slug}`),
    },
  };
}

export default async function ShortStoryPost({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  return (
    <div className="min-h-screen bg-gray-100 p-6 md:p-8 lg:p-10">
      <div className="prose max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-2xl border border-gray-200">
        <Link href="/short-stories" className="text-sm text-rose-600 hover:underline no-underline">
          &larr; Between Stitches
        </Link>

        <div className="mt-4">
          <BlogPostArticle post={post} titleAs="h1" />
        </div>
      </div>
    </div>
  );
}
