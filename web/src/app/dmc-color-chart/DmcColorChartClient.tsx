'use client';

import { useMemo, useState } from 'react';

interface DmcColor {
  number: string;
  name: string;
  r: number;
  g: number;
  b: number;
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

function readableTextColor(r: number, g: number, b: number): string {
  // Standard relative-luminance threshold for picking readable label text.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1f2937' : '#ffffff';
}

export default function DmcColorChartClient({ colors }: { colors: DmcColor[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return colors;
    return colors.filter(
      (c) => c.number.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
  }, [colors, query]);

  return (
    <div>
      <div className="mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by DMC number or color name (e.g. 310, Very Dark Dusty Rose)"
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
        />
        <p className="mt-1 text-xs text-gray-400">
          {filtered.length} of {colors.length} DMC colors
        </p>
      </div>

      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {filtered.map((c) => {
          const hex = toHex(c.r, c.g, c.b);
          return (
            <div
              key={c.number}
              className="rounded-lg border border-gray-200 overflow-hidden bg-white flex flex-col"
              title={`DMC ${c.number} — ${c.name} — ${hex}`}
            >
              <div
                className="h-14 flex items-end p-1.5"
                style={{ backgroundColor: hex, color: readableTextColor(c.r, c.g, c.b) }}
              >
                <span className="text-xs font-bold">{c.number}</span>
              </div>
              <div className="px-2 py-1.5">
                <p className="text-xs text-gray-700 leading-tight">{c.name}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{hex}</p>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-8">
          No DMC color matches &quot;{query}&quot;.
        </p>
      )}
    </div>
  );
}
