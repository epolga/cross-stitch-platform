import { NextResponse } from 'next/server';
import { getReactionCount, incrementReaction } from '@/lib/blog-reactions';
import { getBlogPost } from '@/lib/blog-posts';
import { createRateLimiter, getClientIp } from '@/lib/rateLimit';

// Anonymous, no-login reaction counter — the lightweight alternative to open
// comments. Rate limited per IP since there's no account to tie a reaction to.
const isRateLimited = createRateLimiter(60_000, 5);

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getBlogPost(slug)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const count = await getReactionCount(slug);
    return NextResponse.json({ slug, count });
  } catch (error) {
    console.error('[blog-react][GET] failed:', error);
    return NextResponse.json({ error: 'Failed to load reaction count' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (isRateLimited(getClientIp(request))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { slug } = await params;
  if (!getBlogPost(slug)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const count = await incrementReaction(slug);
    return NextResponse.json({ slug, count });
  } catch (error) {
    console.error('[blog-react][POST] failed:', error);
    return NextResponse.json({ error: 'Failed to record reaction' }, { status: 500 });
  }
}
