import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getEditorEventsByDate } from '@/lib/editor-events';
import { listFeatureRequests } from '@/lib/feature-requests';

export const dynamic = 'force-dynamic';

function getLast30Dates(): string[] {
  const dates: string[] = [];
  const d = new Date();
  for (let i = 0; i < 30; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  return dates;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const dates = getLast30Dates();

    const [allEventArrays, allFeedback] = await Promise.all([
      Promise.all(dates.map(d => getEditorEventsByDate(d))),
      listFeatureRequests(),
    ]);

    const dailyCounts = dates.map((date, i) => {
      const counts: Record<string, number> = {};
      for (const e of allEventArrays[i]) {
        counts[e.eventType] = (counts[e.eventType] ?? 0) + 1;
      }
      return { date, counts };
    });

    const allEvents = allEventArrays.flat();

    const recentErrors = allEvents
      .filter(e => e.eventType === 'editor_error')
      .sort((a, b) => b.ts.localeCompare(a.ts))
      .slice(0, 20);

    const sourceCounts = new Map<string, number>();
    for (const e of allEvents.filter(e => e.eventType === 'editor_opened')) {
      const src = e.source ?? 'direct';
      sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
    }
    const topSources = [...sourceCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([source, count]) => ({ source, count }));

    const thirtyDaysAgo = dates[dates.length - 1];
    const recentFeedback = allFeedback
      .filter(f => f.createdAt >= thirtyDaysAgo)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20);

    const qualityEvents = allEvents.filter(e => e.eventType === 'pattern_quality_feedback');
    const qualityCounts = { yes: 0, mostly: 0, no: 0 };
    for (const e of qualityEvents) {
      if (e.rating === 'yes' || e.rating === 'mostly' || e.rating === 'no') qualityCounts[e.rating]++;
    }
    const recentQualityReasons = qualityEvents
      .filter(e => e.rating === 'no' && e.qualityReason)
      .sort((a, b) => b.ts.localeCompare(a.ts))
      .slice(0, 20)
      .map(e => ({ ts: e.ts, reason: e.qualityReason! }));

    return NextResponse.json({
      dailyCounts, recentErrors, recentFeedback, topSources,
      qualityCounts, recentQualityReasons,
    });
  } catch (e) {
    console.error('[admin/editor-analytics] GET error:', e);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
