"use client";

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export default function SearchForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [widthFrom, setWidthFrom] = useState(params.get('widthFrom') || '');
  const [widthTo, setWidthTo] = useState(params.get('widthTo') || '');
  const [heightFrom, setHeightFrom] = useState(params.get('heightFrom') || '');
  const [heightTo, setHeightTo] = useState(params.get('heightTo') || '');
  const [ncolorsFrom, setNColorsFrom] = useState(params.get('ncolorsFrom') || '');
  const [ncolorsTo, setNColorsTo] = useState(params.get('ncolorsTo') || '');
  const [searchText, setSearchText] = useState(params.get('searchText') || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const searchParams = new URLSearchParams();

    if (widthFrom) searchParams.set('widthFrom', widthFrom);
    if (widthTo) searchParams.set('widthTo', widthTo);
    if (heightFrom) searchParams.set('heightFrom', heightFrom);
    if (heightTo) searchParams.set('heightTo', heightTo);
    if (ncolorsFrom) searchParams.set('ncolorsFrom', ncolorsFrom);
    if (ncolorsTo) searchParams.set('ncolorsTo', ncolorsTo);
    if (searchText) searchParams.set('searchText', searchText);

    const query = searchParams.toString();
    const target = query ? `/?${query}#results` : '/#results';
    router.push(target, { scroll: false });
    scrollToResults();
  };

  const handleReset = () => {
    setWidthFrom('');
    setWidthTo('');
    setHeightFrom('');
    setHeightTo('');
    setNColorsFrom('');
    setNColorsTo('');
    setSearchText('');
    router.push('/#results', { scroll: false });
    scrollToResults();
  };

  const scrollToResults = useCallback(() => {
    if (typeof window === 'undefined') return;
    const resultsEl = document.getElementById('results');
    if (resultsEl) {
      resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === '#results') {
      scrollToResults();
    }
  }, [params, scrollToResults]);

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 p-4 bg-white text-black rounded-lg border border-gray-200 shadow-lg min-w-0"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium">Text Search</label>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full border rounded px-0.5 py-0.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium">Width From</label>
          <input
            type="number"
            value={widthFrom}
            onChange={(e) => setWidthFrom(e.target.value)}
            className="w-full border rounded px-0.5 py-0.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium">Width To</label>
          <input
            type="number"
            value={widthTo}
            onChange={(e) => setWidthTo(e.target.value)}
            className="w-full border rounded px-0.5 py-0.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium">Height From</label>
          <input
            type="number"
            value={heightFrom}
            onChange={(e) => setHeightFrom(e.target.value)}
            className="w-full border rounded px-0.5 py-0.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium">Height To</label>
          <input
            type="number"
            value={heightTo}
            onChange={(e) => setHeightTo(e.target.value)}
            className="w-full border rounded px-0.5 py-0.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium">Colors From</label>
          <input
            type="number"
            value={ncolorsFrom}
            onChange={(e) => setNColorsFrom(e.target.value)}
            className="w-full border rounded px-0.5 py-0.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium">Colors To</label>
          <input
            type="number"
            value={ncolorsTo}
            onChange={(e) => setNColorsTo(e.target.value)}
            className="w-full border rounded px-0.5 py-0.5 text-sm"
          />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          className="px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
        >
          Search
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="px-2 py-1 bg-gray-400 text-white rounded hover:bg-gray-500 text-sm"
        >
          Reset
        </button>
      </div>
    </form>
  );
}
