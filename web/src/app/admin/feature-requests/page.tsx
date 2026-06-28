'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isUserLoggedIn } from '@/app/components/AuthControl';
import type { FeatureRequest, RequestStatus } from '@/lib/feature-requests';

const STATUS_LABELS: Record<RequestStatus, string> = {
  new:      'New',
  reviewed: 'Reviewed',
  planned:  'Planned',
  done:     'Done',
  rejected: 'Rejected',
};

const STATUS_COLORS: Record<RequestStatus, string> = {
  new:      'bg-blue-100 text-blue-800',
  reviewed: 'bg-yellow-100 text-yellow-800',
  planned:  'bg-purple-100 text-purple-800',
  done:     'bg-green-100 text-green-800',
  rejected: 'bg-gray-100 text-gray-500',
};

const IMPORTANCE_LABELS: Record<string, string> = {
  'nice-to-have': 'Nice to have',
  'important':    'Important',
  'need-this':    'I really need this',
};

const IMPORTANCE_COLORS: Record<string, string> = {
  'nice-to-have': 'text-gray-500',
  'important':    'text-amber-600 font-medium',
  'need-this':    'text-rose-600 font-semibold',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatTime(seconds?: number) {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function AdminFeatureRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<RequestStatus | 'all'>('all');
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (!isUserLoggedIn()) { router.replace('/'); return; }
    fetch('/api/admin/me', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { isAdmin?: boolean }) => {
        if (!d.isAdmin) { router.replace('/'); return; }
        void fetchRequests();
      })
      .catch(() => router.replace('/'));
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchRequests() {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/admin/feature-requests', { cache: 'no-store' });
      const data = await resp.json() as { requests?: FeatureRequest[]; error?: string };
      if (!resp.ok) throw new Error(data.error ?? 'Access denied');
      setRequests(data.requests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: RequestStatus) {
    setUpdating(id);
    try {
      const resp = await fetch(`/api/admin/feature-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!resp.ok) throw new Error('Failed to update');
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setUpdating(null);
    }
  }

  const visible = filterStatus === 'all'
    ? requests
    : requests.filter(r => r.status === filterStatus);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Feature Requests</h1>
          <p className="text-sm text-gray-500 mt-0.5">{requests.length} total</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['all', 'new', 'reviewed', 'planned', 'done', 'rejected'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filterStatus === s
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
              }`}
            >
              {s === 'all' ? `All (${requests.length})` : `${STATUS_LABELS[s]} (${requests.filter(r => r.status === s).length})`}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && visible.length === 0 && (
        <p className="text-sm text-gray-400">No requests yet.</p>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="space-y-3">
          {visible.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{r.text}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-400">
                    <span>{formatDate(r.createdAt)}</span>
                    <span className={IMPORTANCE_COLORS[r.importance]}>{IMPORTANCE_LABELS[r.importance]}</span>
                    {r.email && <span>✉ {r.email}</span>}
                    {r.browserLanguage && <span>🌐 {r.browserLanguage}</span>}
                  </div>
                  {(r.patternWidth || r.editorTimeSeconds != null || r.userChangedStitchesCount != null) && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1.5 text-xs text-gray-400">
                      {r.patternWidth && r.patternHeight && <span>Pattern {r.patternWidth}×{r.patternHeight}</span>}
                      {r.colorsCount != null && <span>{r.colorsCount} colors</span>}
                      {r.editorTimeSeconds != null && <span>⏱ {formatTime(r.editorTimeSeconds)} in editor</span>}
                      {r.userChangedStitchesCount != null && <span>✏ {r.userChangedStitchesCount} edits</span>}
                      {r.exportedPdf != null && <span>{r.exportedPdf ? '✓ downloaded PDF' : '✗ no PDF'}</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status]}`}>
                    {STATUS_LABELS[r.status]}
                  </span>
                  <select
                    value={r.status}
                    disabled={updating === r.id}
                    onChange={e => updateStatus(r.id, e.target.value as RequestStatus)}
                    className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-300 disabled:opacity-50"
                  >
                    {(Object.keys(STATUS_LABELS) as RequestStatus[]).map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
