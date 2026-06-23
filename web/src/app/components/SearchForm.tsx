"use client";

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { SUBJECTS } from '@/data/album-taxonomy';

type SizeCategory = 'small' | 'medium' | 'large';
type Orientation = 'portrait' | 'landscape' | 'square';

export default function SearchForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [searchText, setSearchText] = useState(params.get('searchText') || '');
  const [subject, setSubject] = useState(params.get('subject') || '');
  const [sizeCategory, setSizeCategory] = useState<SizeCategory | ''>(
    (params.get('sizeCategory') as SizeCategory) || ''
  );
  const [orientation, setOrientation] = useState<Orientation | ''>(
    (params.get('orientation') as Orientation) || ''
  );
  const [isBeginnerFriendly, setIsBeginnerFriendly] = useState(
    params.get('isBeginnerFriendly') === 'true'
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [widthFrom, setWidthFrom] = useState(params.get('widthFrom') || '');
  const [widthTo, setWidthTo] = useState(params.get('widthTo') || '');
  const [heightFrom, setHeightFrom] = useState(params.get('heightFrom') || '');
  const [heightTo, setHeightTo] = useState(params.get('heightTo') || '');
  const [ncolorsFrom, setNColorsFrom] = useState(params.get('ncolorsFrom') || '');
  const [ncolorsTo, setNColorsTo] = useState(params.get('ncolorsTo') || '');

  const scrollToResults = useCallback(() => {
    if (typeof window === 'undefined') return;
    const el = document.getElementById('results');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === '#results') scrollToResults();
  }, [params, scrollToResults]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (searchText) sp.set('searchText', searchText);
    if (subject) sp.set('subject', subject);
    if (sizeCategory) sp.set('sizeCategory', sizeCategory);
    if (orientation) sp.set('orientation', orientation);
    if (isBeginnerFriendly) sp.set('isBeginnerFriendly', 'true');
    if (widthFrom) sp.set('widthFrom', widthFrom);
    if (widthTo) sp.set('widthTo', widthTo);
    if (heightFrom) sp.set('heightFrom', heightFrom);
    if (heightTo) sp.set('heightTo', heightTo);
    if (ncolorsFrom) sp.set('ncolorsFrom', ncolorsFrom);
    if (ncolorsTo) sp.set('ncolorsTo', ncolorsTo);
    const query = sp.toString();
    router.push(query ? `/?${query}#results` : '/#results', { scroll: false });
    scrollToResults();
    type GtagFn = (...args: unknown[]) => void;
    if (typeof window !== 'undefined' && typeof (window as Window & { gtag?: GtagFn }).gtag === 'function') {
      (window as Window & { gtag: GtagFn }).gtag('event', 'filter_search', { filters: query });
    }
  };

  const handleReset = () => {
    setSearchText('');
    setSubject('');
    setSizeCategory('');
    setOrientation('');
    setIsBeginnerFriendly(false);
    setWidthFrom('');
    setWidthTo('');
    setHeightFrom('');
    setHeightTo('');
    setNColorsFrom('');
    setNColorsTo('');
    router.push('/#results', { scroll: false });
    scrollToResults();
  };

  const toggleSize = (val: SizeCategory) =>
    setSizeCategory(prev => (prev === val ? '' : val));

  const toggleOrientation = (val: Orientation) =>
    setOrientation(prev => (prev === val ? '' : val));

  const pillBase = 'px-2 py-0.5 rounded text-xs border cursor-pointer select-none';
  const pillActive = 'bg-gray-600 text-white border-gray-600';
  const pillInactive = 'bg-white text-gray-600 border-gray-300 hover:border-gray-500';

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 p-4 bg-white text-black rounded-lg border border-gray-200 shadow-lg min-w-0"
    >
      {/* Text search */}
      <div className="mb-3">
        <label className="block text-xs font-medium mb-0.5">Text Search</label>
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="w-full border rounded px-1 py-0.5 text-sm"
        />
      </div>

      {/* Subject */}
      <div className="mb-3">
        <label className="block text-xs font-medium mb-0.5">Subject</label>
        <select
          value={subject}
          onChange={e => setSubject(e.target.value)}
          className="w-full border rounded px-1 py-0.5 text-sm"
        >
          <option value="">All subjects</option>
          {SUBJECTS.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Size */}
      <div className="mb-3">
        <label className="block text-xs font-medium mb-1">Size</label>
        <div className="flex gap-1">
          {(['small', 'medium', 'large'] as SizeCategory[]).map(val => (
            <button
              key={val}
              type="button"
              onClick={() => toggleSize(val)}
              className={`${pillBase} ${sizeCategory === val ? pillActive : pillInactive}`}
            >
              {val.charAt(0).toUpperCase() + val.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Orientation */}
      <div className="mb-3">
        <label className="block text-xs font-medium mb-1">Orientation</label>
        <div className="flex gap-1">
          {(['portrait', 'landscape', 'square'] as Orientation[]).map(val => (
            <button
              key={val}
              type="button"
              onClick={() => toggleOrientation(val)}
              className={`${pillBase} ${orientation === val ? pillActive : pillInactive}`}
            >
              {val.charAt(0).toUpperCase() + val.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Beginner-friendly */}
      <div className="mb-3 flex items-center gap-2">
        <input
          id="beginner"
          type="checkbox"
          checked={isBeginnerFriendly}
          onChange={e => setIsBeginnerFriendly(e.target.checked)}
          className="cursor-pointer"
        />
        <label htmlFor="beginner" className="text-xs font-medium cursor-pointer">
          Beginner-friendly only
        </label>
      </div>

      {/* Advanced toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(v => !v)}
        className="text-xs text-gray-500 hover:text-gray-700 mb-2 underline"
      >
        {showAdvanced ? 'Hide' : 'Show'} advanced filters
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-xs font-medium">Width From</label>
            <input type="number" value={widthFrom} onChange={e => setWidthFrom(e.target.value)}
              className="w-full border rounded px-0.5 py-0.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium">Width To</label>
            <input type="number" value={widthTo} onChange={e => setWidthTo(e.target.value)}
              className="w-full border rounded px-0.5 py-0.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium">Height From</label>
            <input type="number" value={heightFrom} onChange={e => setHeightFrom(e.target.value)}
              className="w-full border rounded px-0.5 py-0.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium">Height To</label>
            <input type="number" value={heightTo} onChange={e => setHeightTo(e.target.value)}
              className="w-full border rounded px-0.5 py-0.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium">Colors From</label>
            <input type="number" value={ncolorsFrom} onChange={e => setNColorsFrom(e.target.value)}
              className="w-full border rounded px-0.5 py-0.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium">Colors To</label>
            <input type="number" value={ncolorsTo} onChange={e => setNColorsTo(e.target.value)}
              className="w-full border rounded px-0.5 py-0.5 text-sm" />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit"
          className="px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm">
          Search
        </button>
        <button type="button" onClick={handleReset}
          className="px-2 py-1 bg-gray-400 text-white rounded hover:bg-gray-500 text-sm">
          Reset
        </button>
      </div>
    </form>
  );
}
