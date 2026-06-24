import { NextRequest, NextResponse } from 'next/server';
import { semanticSearch } from '@/lib/semantic-search';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();
    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }
    const designIds = await semanticSearch(String(query).slice(0, 500), 60);
    return NextResponse.json({ designIds });
  } catch (err) {
    console.error('[semantic-search] error:', err);
    return NextResponse.json({ error: 'Semantic search failed' }, { status: 500 });
  }
}
