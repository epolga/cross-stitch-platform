'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const SUGGESTIONS = [
  'small floral for beginners',
  'large landscape with few colors',
  'Christmas motifs under 50 stitches',
  'animals with 5 colors or less',
];

export default function HeroSearch() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function runSearch(searchQuery: string) {
    const q = searchQuery.trim();
    if (!q) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });

      if (!res.ok) throw new Error('Search failed');

      const filters = await res.json();
      const params = new URLSearchParams();

      if (filters.searchText) params.set('searchText', filters.searchText);
      if (filters.widthFrom > 0) params.set('widthFrom', String(filters.widthFrom));
      if (filters.widthTo < 10000) params.set('widthTo', String(filters.widthTo));
      if (filters.heightFrom > 0) params.set('heightFrom', String(filters.heightFrom));
      if (filters.heightTo < 10000) params.set('heightTo', String(filters.heightTo));
      if (filters.ncolorsFrom > 0) params.set('ncolorsFrom', String(filters.ncolorsFrom));
      if (filters.ncolorsTo < 10000) params.set('ncolorsTo', String(filters.ncolorsTo));

      router.push(`/?${params.toString()}#results`, { scroll: false });
      document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      type GtagFn = (...args: unknown[]) => void;
      if (typeof window !== 'undefined' && typeof (window as Window & { gtag?: GtagFn }).gtag === 'function') {
        (window as Window & { gtag: GtagFn }).gtag('event', 'ai_search', {
          search_query: q,
          resolved_filters: params.toString(),
        });
      }
    } catch {
      setError('Search failed — please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 rounded-xl bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-200 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-rose-500 mb-2">
        AI-powered search
      </p>
      <p className="text-lg font-semibold text-gray-900 mb-3">
        Describe what you&apos;re looking for in plain English — size, colors, theme, difficulty.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(query);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. small beginner floral with few colors"
          className="flex-1 rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent disabled:opacity-60"
          disabled={loading}
          maxLength={300}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-lg bg-rose-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-600 active:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setQuery(s);
              runSearch(s);
            }}
            disabled={loading}
            className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
