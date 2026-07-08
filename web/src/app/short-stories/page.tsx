import { Metadata } from 'next';
import Link from 'next/link';
import { buildCanonicalUrl } from '@/lib/url-helper';
import { getSortedBlogPosts } from '@/lib/blog-posts';

const canonicalUrl = buildCanonicalUrl('/short-stories');

export const metadata: Metadata = {
  title: 'My thoughts | Cross Stitch Designs',
  description: 'Personal notes and stories about cross-stitching, from Ann.',
  alternates: {
    canonical: canonicalUrl,
  },
};

export default function ShortStories() {
  const posts = getSortedBlogPosts();

  return (
    <div className="min-h-screen bg-gray-100 p-6 md:p-8 lg:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-center text-gray-800">My thoughts</h1>

        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/short-stories/${post.slug}`}
            className="block bg-white p-8 rounded-xl shadow-2xl border border-gray-200 hover:shadow-lg transition-shadow"
          >
            <p className="text-sm text-gray-500">
              {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            <h2 className="text-2xl font-semibold mt-2 text-gray-700">{post.title}</h2>
            <p className="mt-3 text-gray-600">{post.excerpt}</p>
            <span className="inline-block mt-4 text-rose-600 font-medium">Read more &rarr;</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
