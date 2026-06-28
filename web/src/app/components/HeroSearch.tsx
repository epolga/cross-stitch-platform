'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const SUGGESTIONS = [
  'small floral for beginners',
  'large landscape with few colors',
  'Christmas motifs under 50 stitches',
  'animals with 5 colors or less',
];

export default function HeroSearch() {
  const [mode, setMode] = useState<'text' | 'image'>('text');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [relatedSuggestions, setRelatedSuggestions] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageDescription, setImageDescription] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const selectedFile = useRef<File | null>(null);
  const router = useRouter();

  async function runTextSearch(searchQuery: string) {
    const q = searchQuery.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    setRelatedSuggestions([]);
    try {
      const [aiResult, semResult] = await Promise.allSettled([
        fetch('/api/ai-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        }),
        fetch('/api/semantic-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        }),
      ]);

      if (aiResult.status === 'rejected' || !aiResult.value.ok) throw new Error('Search failed');
      const filters = await aiResult.value.json();

      const params = new URLSearchParams();
      if (filters.searchText) params.set('searchText', filters.searchText);
      if (filters.widthFrom > 0) params.set('widthFrom', String(filters.widthFrom));
      if (filters.widthTo < 10000) params.set('widthTo', String(filters.widthTo));
      if (filters.heightFrom > 0) params.set('heightFrom', String(filters.heightFrom));
      if (filters.heightTo < 10000) params.set('heightTo', String(filters.heightTo));
      if (filters.ncolorsFrom > 0) params.set('ncolorsFrom', String(filters.ncolorsFrom));
      if (filters.ncolorsTo < 10000) params.set('ncolorsTo', String(filters.ncolorsTo));

      let semanticIds: number[] = [];
      if (semResult.status === 'fulfilled' && semResult.value.ok) {
        const { designIds } = await semResult.value.json() as { designIds?: number[] };
        if (designIds?.length) {
          semanticIds = designIds;
          params.set('semanticIds', designIds.join(','));
        }
      }

      router.push(`/?${params.toString()}#results`, { scroll: false });

      if (semanticIds.length > 0) {
        fetch('/api/related-searches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ semanticIds: semanticIds.slice(0, 30), currentQuery: q }),
        })
          .then(r => r.ok ? r.json() : null)
          .then((data: { suggestions: string[] } | null) => {
            if (data?.suggestions?.length) setRelatedSuggestions(data.suggestions);
          })
          .catch(() => {});
      }
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

  async function runImageSearch(file: File) {
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const resp = await fetch('/api/image-search', { method: 'POST', body: formData });
      if (!resp.ok) {
        const { error: msg } = await resp.json().catch(() => ({ error: 'Search failed' }));
        throw new Error(msg || 'Search failed');
      }
      const { designIds, description } = await resp.json() as { designIds: number[]; description?: string };
      if (!designIds?.length) throw new Error('No results found');
      if (description) setImageDescription(description);
      const params = new URLSearchParams({ semanticIds: designIds.join(',') });
      router.push(`/?${params.toString()}#results`, { scroll: false });
      document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed — please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Please upload an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image too large — please use a file under 5 MB.'); return; }
    selectedFile.current = file;
    setPreviewUrl(URL.createObjectURL(file));
    setError('');
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  return (
    <div className="mb-6 rounded-xl bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-200 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-rose-500 mb-2">
        AI-powered search
      </p>

      {/* Mode toggle */}
      <div className="flex gap-1 mb-4 bg-white border border-rose-200 rounded-lg p-1 w-fit">
        <button
          type="button"
          onClick={() => { setMode('text'); setError(''); }}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${mode === 'text' ? 'bg-rose-500 text-white font-medium' : 'text-rose-700 hover:bg-rose-50'}`}
        >
          Text search
        </button>
        <button
          type="button"
          onClick={() => { setMode('image'); setError(''); }}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${mode === 'image' ? 'bg-rose-500 text-white font-medium' : 'text-rose-700 hover:bg-rose-50'}`}
        >
          Search by image
        </button>
      </div>

      {mode === 'text' ? (
        <>
          <p className="text-lg font-semibold text-gray-900 mb-3">
            Describe what you&apos;re looking for — size, colors, theme, difficulty.
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); runTextSearch(query); }}
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
                onClick={() => { setQuery(s); runTextSearch(s); }}
                disabled={loading}
                className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
          {relatedSuggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-gray-400">Explore also:</span>
              {relatedSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setQuery(s); runTextSearch(s); }}
                  disabled={loading}
                  className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs text-rose-800 hover:bg-rose-100 disabled:opacity-50 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-lg font-semibold text-gray-900 mb-3">
            Upload any image and I&apos;ll find visually similar patterns in the catalog.
          </p>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors p-6
              ${dragOver ? 'border-rose-400 bg-rose-100' : 'border-rose-200 bg-white hover:bg-rose-50'}`}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {previewUrl ? (
              <div className="relative w-32 h-32">
                <Image src={previewUrl} alt="Selected image" fill className="object-contain rounded" unoptimized />
              </div>
            ) : (
              <>
                <svg className="w-10 h-10 text-rose-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-gray-500">Drag and drop or <span className="text-rose-600 font-medium">click to upload</span></p>
                <p className="text-xs text-gray-400">JPEG, PNG, WebP — max 5 MB</p>
              </>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={loading || !previewUrl}
              onClick={() => { if (selectedFile.current) runImageSearch(selectedFile.current); }}
              className="rounded-lg bg-rose-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-600 active:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Searching…' : 'Find similar patterns'}
            </button>
            {previewUrl && !loading && (
              <button
                type="button"
                onClick={() => { setPreviewUrl(null); selectedFile.current = null; setImageDescription(null); if (fileRef.current) fileRef.current.value = ''; }}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear
              </button>
            )}
            <p className="text-xs text-gray-400">Image used only for search — not stored.</p>
          </div>
          {imageDescription && (
            <p className="mt-2 text-xs text-gray-500 italic">Searching for: &ldquo;{imageDescription}&rdquo;</p>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}
