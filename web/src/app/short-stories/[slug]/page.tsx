import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildCanonicalUrl } from '@/lib/url-helper';
import { getBlogPost, getSortedBlogPosts } from '@/lib/blog-posts';
import BlogReaction from '@/app/components/BlogReaction';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getSortedBlogPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};

  return {
    title: `${post.title} | My thoughts`,
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
          &larr; My thoughts
        </Link>

        <p className="text-sm text-gray-500 mt-4">
          {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="text-3xl font-bold text-gray-800 mt-2">{post.title}</h1>

        {post.body.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}

        <BlogReaction slug={post.slug} />
      </div>
    </div>
  );
}
