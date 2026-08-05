import { Metadata } from 'next';
import { buildCanonicalUrl } from '@/lib/url-helper';
import { getSortedBlogPosts } from '@/lib/blog-posts';
import BlogPostArticle from '@/app/components/BlogPostArticle';

const canonicalUrl = buildCanonicalUrl('/short-stories');

export const metadata: Metadata = {
  title: 'Between Stitches | Cross Stitch Designs',
  description: 'Personal notes and stories about cross-stitching, from Ann.',
  alternates: {
    canonical: canonicalUrl,
  },
};

export default function ShortStories() {
  const posts = getSortedBlogPosts();

  return (
    <div className="min-h-screen bg-gray-100 p-6 md:p-8 lg:p-10">
      <div className="max-w-3xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-center text-gray-800">Between Stitches</h1>

        {posts.map((post) => (
          <div
            key={post.slug}
            id={post.slug}
            className="prose max-w-none bg-white p-8 rounded-xl shadow-2xl border border-gray-200 scroll-mt-24"
          >
            <BlogPostArticle post={post} permalinkHref={`/short-stories/${post.slug}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
