'use client';

import { SYMBOLS } from '@/lib/symbols';
import type { PatternPalette } from '@/lib/pattern-converter';

interface Props {
  open: boolean;
  paletteIndex: number;
  palette: PatternPalette[];
  onPick: (symbol: string) => void;
  onClose: () => void;
}

export default function SymbolPickerDialog({ open, paletteIndex, palette, onPick, onClose }: Props) {
  if (!open || paletteIndex < 0 || paletteIndex >= palette.length) return null;

  const entry = palette[paletteIndex];
  const usedSymbols = new Set(palette.filter((_, i) => i !== paletteIndex).map(p => p.symbol));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-[540px] max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900">Change Symbol</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          DMC {entry.number} — {entry.name}.{' '}
          Current: <span className="font-mono font-bold text-gray-900">{entry.symbol}</span>.{' '}
          Grayed symbols are already assigned to another color.
        </p>

        <div className="flex flex-wrap gap-1">
          {SYMBOLS.map(sym => {
            const isCurrent = sym === entry.symbol;
            const isUsed = usedSymbols.has(sym);
            return (
              <button
                key={sym}
                type="button"
                disabled={isUsed}
                title={isUsed ? `${sym} — already in use` : sym}
                onClick={() => onPick(sym)}
                style={{
                  width: 34,
                  height: 34,
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  fontSize: 15,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 4,
                  cursor: isUsed ? 'not-allowed' : 'pointer',
                  border: isCurrent
                    ? '2px solid #e11d48'
                    : '1px solid rgba(0,0,0,0.15)',
                  backgroundColor: isCurrent ? '#fff1f2' : '#fff',
                  color: isUsed ? '#d1d5db' : '#111827',
                }}
              >
                {sym}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
