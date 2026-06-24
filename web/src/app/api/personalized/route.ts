import { NextRequest, NextResponse } from 'next/server';
import { getSimilarIds } from '@/lib/similar-designs';
import { getDesignById } from '@/lib/data-access';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { viewedIds } = await request.json() as { viewedIds: number[] };
  if (!Array.isArray(viewedIds) || viewedIds.length === 0) {
    return NextResponse.json({ designs: [] });
  }

  const recentIds = viewedIds.slice(0, 5);
  const neighborLists = await Promise.all(recentIds.map(id => getSimilarIds(id)));

  const viewedSet = new Set(viewedIds);
  const seen = new Set<number>();
  const candidates: number[] = [];

  // Round-robin across neighbor lists so all viewed designs have equal influence
  const maxLen = Math.max(...neighborLists.map(l => l.length));
  for (let i = 0; i < maxLen && candidates.length < 12; i++) {
    for (const neighbors of neighborLists) {
      const id = neighbors[i];
      if (id !== undefined && !viewedSet.has(id) && !seen.has(id)) {
        seen.add(id);
        candidates.push(id);
        if (candidates.length >= 12) break;
      }
    }
  }

  const designs = (await Promise.all(candidates.map(id => getDesignById(id))))
    .filter((d): d is NonNullable<typeof d> => d !== undefined);

  return NextResponse.json({ designs });
}
