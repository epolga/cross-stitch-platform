'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isUserLoggedIn } from '@/app/components/AuthControl';
import type { EditorEventRecord } from '@/lib/editor-events';
import type { FeatureRequest } from '@/lib/feature-requests';

interface DailyCount {
  date: string;
  counts: Record<string, number>;
}

interface AnalyticsData {
  dailyCounts: DailyCount[];
  recentErrors: EditorEventRecord[];
  recentFeedback: FeatureRequest[];
  topSources: { source: string; count: number }[];
}

const IMPORTANCE_COLORS: Record<string, string> = {
  'nice-to-have': 'text-gray-500',
  'important':    'text-amber-600 font-medium',
  'need-this':    'text-rose-600 font-semibold',
};

function pct(num: number, denom: number): string {
  if (!denom) return '—';
  return ((num / denom) * 100).toFixed(0) + '%';
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function EditorAnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isUserLoggedIn()) { router.replace('/'); return; }
    fetch('/api/admin/me', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { isAdmin?: boolean }) => {
        if (!d.isAdmin) { router.replace('/'); return; }
        void load();
      })
      .catch(() => router.replace('/'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/admin/editor-analytics', { cache: 'no-store' });
      const d = await resp.json() as AnalyticsData & { error?: string };
      if (!resp.ok) throw new Error(d.error ?? 'Failed');
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 space-y-10">
      <h1 className="text-2xl font-semibold text-gray-900">Editor Analytics</h1>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error   && <p className="text-sm text-red-600">{error}</p>}

      {data && (
        <>
          {/* Daily funnel */}
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Daily funnel — last 30 days</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <th className="px-3 py-2 text-left border-b border-gray-200">Date</th>
                    <th className="px-3 py-2 text-right border-b border-gray-200">Opened</th>
                    <th className="px-3 py-2 text-right border-b border-gray-200">Generated</th>
                    <th className="px-3 py-2 text-right border-b border-gray-200">Gen%</th>
                    <th className="px-3 py-2 text-right border-b border-gray-200">PDF</th>
                    <th className="px-3 py-2 text-right border-b border-gray-200">PDF%</th>
                    <th className="px-3 py-2 text-right border-b border-gray-200">Feedback</th>
                    <th className="px-3 py-2 text-right border-b border-gray-200">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dailyCounts.map(({ date, counts }) => {
                    const opened    = counts.editor_opened    ?? 0;
                    const generated = counts.pattern_generated ?? 0;
                    const pdf       = counts.pdf_exported      ?? 0;
                    const feedback  = counts.feedback_submitted ?? 0;
                    const errors    = counts.editor_error       ?? 0;
                    const hasData   = opened > 0 || errors > 0;
                    return (
                      <tr key={date} className={`border-b border-gray-100 ${!hasData ? 'text-gray-300' : 'hover:bg-gray-50'}`}>
                        <td className="px-3 py-2 font-mono text-xs text-gray-500">{date}</td>
                        <td className="px-3 py-2 text-right font-medium">{opened || '—'}</td>
                        <td className="px-3 py-2 text-right">{generated || '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-400 text-xs">{generated ? pct(generated, opened) : '—'}</td>
                        <td className="px-3 py-2 text-right">{pdf || '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-400 text-xs">{pdf ? pct(pdf, generated) : '—'}</td>
                        <td className="px-3 py-2 text-right">{feedback || '—'}</td>
                        <td className={`px-3 py-2 text-right ${errors > 0 ? 'text-rose-600 font-semibold' : ''}`}>{errors || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Top sources */}
          {data.topSources.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Top entry sources</h2>
              <table className="text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <th className="px-3 py-2 text-left border-b border-gray-200">Source</th>
                    <th className="px-3 py-2 text-right border-b border-gray-200">Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topSources.map(s => (
                    <tr key={s.source} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-700">{s.source}</td>
                      <td className="px-3 py-2 text-right font-medium">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Recent errors */}
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Recent errors <span className="font-normal text-gray-400 text-sm">({data.recentErrors.length})</span></h2>
            {data.recentErrors.length === 0 ? (
              <p className="text-sm text-gray-400">No errors yet.</p>
            ) : (
              <div className="space-y-2">
                {data.recentErrors.map(e => (
                  <div key={e.id} className="bg-rose-50 border border-rose-100 rounded-lg px-4 py-3 text-sm">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="font-mono text-xs text-gray-400">{fmt(e.ts)}</span>
                      {e.errorCode && <span className="font-medium text-rose-700">{e.errorCode}</span>}
                      {e.step      && <span className="text-gray-500">step: {e.step}</span>}
                      <span className="text-gray-400 text-xs truncate max-w-[160px]" title={e.sessionId}>session: {e.sessionId.slice(0, 8)}…</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent feedback */}
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Recent feedback <span className="font-normal text-gray-400 text-sm">({data.recentFeedback.length})</span></h2>
            {data.recentFeedback.length === 0 ? (
              <p className="text-sm text-gray-400">No feedback yet.</p>
            ) : (
              <div className="space-y-2">
                {data.recentFeedback.map(f => (
                  <div key={f.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm shadow-sm">
                    <p className="text-gray-900 whitespace-pre-wrap">{f.text}</p>
                    <div className="flex items-center gap-4 flex-wrap mt-1.5 text-xs text-gray-400">
                      <span>{fmt(f.createdAt)}</span>
                      <span className={IMPORTANCE_COLORS[f.importance] ?? ''}>{f.importance}</span>
                      {f.patternWidth && f.patternHeight && <span>{f.patternWidth}×{f.patternHeight}</span>}
                      {f.email && <span>{f.email}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
