import Image from 'next/image';
import Link from 'next/link';
import { BlogPost } from '@/lib/blog-posts';
import BlogReaction from './BlogReaction';

export default function BlogPostArticle({
  post,
  permalinkHref,
  titleAs = 'h2',
}: {
  post: BlogPost;
  permalinkHref?: string;
  titleAs?: 'h1' | 'h2';
}) {
  const dateLabel = new Date(post.date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const Title = titleAs;

  return (
    <article>
      {permalinkHref ? (
        <Link href={permalinkHref} className="text-sm text-gray-500 hover:text-rose-600 hover:underline">
          {dateLabel}
        </Link>
      ) : (
        <p className="text-sm text-gray-500">{dateLabel}</p>
      )}
      <Title className="text-2xl font-semibold mt-2 text-gray-800">{post.title}</Title>

      {post.imageUrl && (
        <div className="relative w-full max-w-sm mx-auto mt-6 aspect-square not-prose">
          <Image
            src={post.imageUrl}
            alt={post.imageAlt ?? post.title}
            fill
            className="object-contain rounded-lg"
            sizes="(max-width: 640px) 100vw, 384px"
          />
        </div>
      )}

      {post.body.map((paragraph, i) => (
        <p key={i} className="mt-4 leading-relaxed">{paragraph}</p>
      ))}

      {post.ctaHref && (
        <p className="mt-4">
          <Link href={post.ctaHref} className="text-rose-600 hover:underline font-medium">
            {post.ctaLabel ?? 'Learn more'}
          </Link>
        </p>
      )}

      <BlogReaction slug={post.slug} />
    </article>
  );
}
