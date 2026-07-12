'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { isUserLoggedIn } from '@/app/components/AuthControl';

interface PatternSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  createdAt: string;
  thumbnail?: string;
}

interface Props {
  open: boolean;
  onPick: (id: string) => void;
  onClose: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function OpenPatternDialog({ open, onPick, onClose }: Props) {
  const [patterns, setPatterns] = useState<PatternSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loggedIn, setLoggedIn] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoggedIn(isUserLoggedIn());
    if (!isUserLoggedIn()) return;
    setLoading(true);
    setError('');
    fetch('/api/converter/patterns/my')
      .then(async r => {
        if (r.status === 401) { setLoggedIn(false); return { patterns: [] }; }
        if (!r.ok) throw new Error('Failed to load your patterns');
        return r.json();
      })
      .then(data => setPatterns(data.patterns ?? []))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load your patterns'))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-[440px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Open a saved pattern</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
        </div>

        {!loggedIn && (
          <div className="text-sm text-gray-600 py-6 text-center">
            Log in to see your saved patterns.
            <div className="mt-3">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  window.dispatchEvent(new CustomEvent('openRegisterModal', {
                    detail: { source: 'converter-open', label: 'Open pattern' },
                  }));
                }}
                className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600"
              >
                Log in
              </button>
            </div>
          </div>
        )}

        {loggedIn && loading && (
          <p className="text-sm text-gray-500 py-6 text-center">Loading your patterns…</p>
        )}

        {loggedIn && !loading && error && (
          <p className="text-sm text-red-600 py-6 text-center">{error}</p>
        )}

        {loggedIn && !loading && !error && patterns.length === 0 && (
          <p className="text-sm text-gray-500 py-6 text-center">
            No saved patterns yet — use Save to create your first one.
          </p>
        )}

        {loggedIn && !loading && !error && patterns.length > 0 && (
          <div className="overflow-y-auto -mx-2 px-2 space-y-1">
            {patterns.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p.id)}
                className="w-full flex items-center gap-3 rounded-lg border border-gray-200 p-2 text-left hover:bg-rose-50 hover:border-rose-200 transition-colors"
              >
                <div className="w-12 h-12 flex-shrink-0 rounded bg-gray-100 overflow-hidden flex items-center justify-center">
                  {p.thumbnail ? (
                    <Image src={p.thumbnail} alt="" width={48} height={48} className="object-cover w-full h-full" unoptimized />
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.name || 'Untitled'}</p>
                  <p className="text-xs text-gray-400">{p.width} × {p.height} · {formatDate(p.createdAt)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
