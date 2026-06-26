'use client';

import { useState, useMemo } from 'react';
import dmcColors from '@/data/dmc-colors.json';
import type { DmcColor, PatternPalette } from '@/lib/pattern-converter';

interface Props {
  open: boolean;
  paletteIndex: number;
  palette: PatternPalette[];
  onPick: (color: DmcColor) => void;
  onClose: () => void;
}

const DMC: DmcColor[] = dmcColors as DmcColor[];

export default function ColorPickerDialog({ open, paletteIndex, palette, onPick, onClose }: Props) {
  const [search, setSearch] = useState('');

  const currentNumber = palette[paletteIndex]?.number ?? '';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return DMC;
    return DMC.filter(c =>
      c.number.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
  }, [search]);

  if (!open || paletteIndex < 0 || paletteIndex >= palette.length) return null;

  const entry = palette[paletteIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-[640px] max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 flex-none">
          <h3 className="text-base font-semibold text-gray-900">Change Color</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
        </div>

        <p className="text-sm text-gray-500 mb-3 flex-none">
          Editing entry {paletteIndex + 1}: <span className="font-mono font-bold text-gray-800">{entry.symbol}</span>{' '}
          — currently DMC {entry.number} ({entry.name}).
        </p>

        <input
          autoFocus
          type="text"
          placeholder="Search by DMC number or name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="mb-3 flex-none w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-300"
        />

        <div className="overflow-y-auto flex-1">
          <div className="flex flex-wrap gap-1">
            {filtered.map(c => {
              const isCurrent = c.number === currentNumber;
              const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
              return (
                <button
                  key={c.number}
                  type="button"
                  title={`DMC ${c.number} — ${c.name}`}
                  onClick={() => onPick(c)}
                  style={{
                    width: 32,
                    height: 32,
                    backgroundColor: `rgb(${c.r},${c.g},${c.b})`,
                    border: isCurrent ? '3px solid #e11d48' : '1px solid rgba(0,0,0,0.2)',
                    borderRadius: 4,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 7,
                    fontFamily: 'monospace',
                    color: lum > 140 ? '#000' : '#fff',
                    flexShrink: 0,
                    outline: isCurrent ? '2px solid #e11d48' : 'none',
                    outlineOffset: 1,
                  }}
                >
                  {c.number}
                </button>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No DMC colors match "{search}"</p>
          )}
        </div>

        <div className="mt-4 flex justify-end flex-none">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
