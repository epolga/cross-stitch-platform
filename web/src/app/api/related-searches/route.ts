import { NextRequest, NextResponse } from 'next/server';
import { getDesignById, getAllAlbumCaptions } from '@/lib/data-access';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { semanticIds, currentQuery } = await request.json() as {
      semanticIds: number[];
      currentQuery?: string;
    };

    if (!Array.isArray(semanticIds) || semanticIds.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    const [albumCaptions, designs] = await Promise.all([
      getAllAlbumCaptions(),
      Promise.all(semanticIds.slice(0, 30).map(id => getDesignById(id))),
    ]);

    if (!albumCaptions) return NextResponse.json({ suggestions: [] });

    const albumMap = new Map(albumCaptions.map(a => [a.albumId, a.Caption]));

    const freq = new Map<string, number>();
    for (const design of designs) {
      if (!design) continue;
      const caption = albumMap.get(design.AlbumID);
      if (!caption) continue;
      freq.set(caption, (freq.get(caption) ?? 0) + 1);
    }

    const queryLower = (currentQuery ?? '').toLowerCase();

    const suggestions = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([caption]) => caption)
      .filter(caption => !queryLower || !caption.toLowerCase().includes(queryLower))
      .slice(0, 6);

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
