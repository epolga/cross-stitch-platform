import { NextRequest, NextResponse } from 'next/server';
import { getSimilarIds } from '@/lib/similar-designs';
import { getDesignById } from '@/lib/data-access';
import type { Design } from '@/app/types/design';

export const dynamic = 'force-dynamic';

export type MatchReason = 'simpler' | 'larger' | 'smaller' | 'similar-palette';

const COLOR_RANK: Record<NonNullable<Design['colorBucket']>, number> = {
  few: 0,
  medium: 1,
  many: 2,
};

const SIZE_RANK: Record<NonNullable<Design['sizeCategory']>, number> = {
  small: 0,
  medium: 1,
  large: 2,
};

// Categorizes a candidate relative to the viewed design it was pulled from,
// reusing the same colorBucket/sizeCategory/subject facets the site's own
// filters use (data-access.ts) rather than inventing new thresholds.
function categorize(viewed: Design, candidate: Design): MatchReason | null {
  if (
    candidate.colorBucket && viewed.colorBucket &&
    COLOR_RANK[candidate.colorBucket] < COLOR_RANK[viewed.colorBucket]
  ) {
    return 'simpler';
  }
  if (
    viewed.subject && candidate.subject === viewed.subject &&
    candidate.sizeCategory && viewed.sizeCategory &&
    candidate.sizeCategory !== viewed.sizeCategory
  ) {
    return SIZE_RANK[candidate.sizeCategory] > SIZE_RANK[viewed.sizeCategory] ? 'larger' : 'smaller';
  }
  if (
    candidate.colorBucket && viewed.colorBucket &&
    candidate.colorBucket === viewed.colorBucket
  ) {
    return 'similar-palette';
  }
  return null;
}

export async function POST(request: NextRequest) {
  const { viewedIds } = await request.json() as { viewedIds: number[] };
  if (!Array.isArray(viewedIds) || viewedIds.length === 0) {
    return NextResponse.json({ designs: [] });
  }

  const recentIds = viewedIds.slice(0, 5);
  const [neighborLists, viewedDesigns] = await Promise.all([
    Promise.all(recentIds.map(id => getSimilarIds(id))),
    Promise.all(recentIds.map(id => getDesignById(id))),
  ]);

  const viewedSet = new Set(viewedIds);
  const seen = new Set<number>();
  // id -> the viewed design it was matched against, so we can categorize it
  // once we have the candidate's own Design record below.
  const candidateSource = new Map<number, Design | undefined>();

  // Round-robin across neighbor lists so all viewed designs have equal influence
  const maxLen = Math.max(...neighborLists.map(l => l.length));
  for (let i = 0; i < maxLen && candidateSource.size < 12; i++) {
    for (let listIdx = 0; listIdx < neighborLists.length; listIdx++) {
      const id = neighborLists[listIdx][i];
      if (id !== undefined && !viewedSet.has(id) && !seen.has(id)) {
        seen.add(id);
        candidateSource.set(id, viewedDesigns[listIdx]);
        if (candidateSource.size >= 12) break;
      }
    }
  }

  const candidateIds = Array.from(candidateSource.keys());
  const resolved = await Promise.all(candidateIds.map(id => getDesignById(id)));

  const designs = resolved
    .map((design, idx) => {
      if (!design) return undefined;
      const viewed = candidateSource.get(candidateIds[idx]);
      const matchReason = viewed ? categorize(viewed, design) : null;
      return matchReason ? { ...design, matchReason } : design;
    })
    .filter((d): d is NonNullable<typeof d> => d !== undefined);

  return NextResponse.json({ designs });
}
