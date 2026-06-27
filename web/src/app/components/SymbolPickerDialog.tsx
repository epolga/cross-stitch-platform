'use client';

import { SYMBOLS } from '@/lib/symbols';
import { isPUA, CUSTOM_SYMBOL_NAMES } from '@/lib/symbol-renderer';
import SymbolPreview from '@/app/components/SymbolPreview';
import type { PatternPalette } from '@/lib/pattern-converter';

interface Props {
  open: boolean;
  paletteIndex: number;
  palette: PatternPalette[];
  onPick: (symbol: string) => void;
  onClose: () => void;
}

const customSymbols  = SYMBOLS.filter(isPUA);
const standardSymbols = SYMBOLS.filter(s => !isPUA(s));

function SymbolButton({
  sym, isCurrent, isUsed, onPick,
}: { sym: string; isCurrent: boolean; isUsed: boolean; onPick: () => void }) {
  const name = isPUA(sym) ? (CUSTOM_SYMBOL_NAMES.get(sym) ?? sym) : sym;
  const title = isUsed ? `${name} — already in use` : name;
  return (
    <button
      type="button"
      disabled={isUsed}
      title={title}
      onClick={onPick}
      style={{
        width: 34,
        height: 34,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        cursor: isUsed ? 'not-allowed' : 'pointer',
        border: isCurrent ? '2px solid #e11d48' : '1px solid rgba(0,0,0,0.15)',
        backgroundColor: isCurrent ? '#fff1f2' : '#fff',
        color: isUsed ? '#d1d5db' : '#111827',
        fontFamily: 'monospace',
        fontWeight: 'bold',
        fontSize: 15,
        opacity: isUsed ? 0.5 : 1,
      }}
    >
      {isPUA(sym) ? (
        <SymbolPreview
          symbol={sym}
          size={20}
          color={isUsed ? '#d1d5db' : '#111827'}
        />
      ) : sym}
    </button>
  );
}

export default function SymbolPickerDialog({ open, paletteIndex, palette, onPick, onClose }: Props) {
  if (!open || paletteIndex < 0 || paletteIndex >= palette.length) return null;

  const entry = palette[paletteIndex];
  const usedSymbols = new Set(palette.filter((_, i) => i !== paletteIndex).map(p => p.symbol));

  const currentDisplay = isPUA(entry.symbol)
    ? <SymbolPreview symbol={entry.symbol} size={16} color="#111827" style={{ display: 'inline-block', verticalAlign: 'middle' }} />
    : <span className="font-mono font-bold text-gray-900">{entry.symbol}</span>;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-[580px] max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900">Change Symbol</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          DMC {entry.number} — {entry.name}.{' '}
          Current: {currentDisplay}.{' '}
          Grayed symbols are already assigned to another color.
        </p>

        {/* Custom canvas-drawn symbols */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Custom</p>
        <div className="flex flex-wrap gap-1 mb-4">
          {customSymbols.map(sym => (
            <SymbolButton
              key={sym}
              sym={sym}
              isCurrent={sym === entry.symbol}
              isUsed={usedSymbols.has(sym)}
              onPick={() => onPick(sym)}
            />
          ))}
        </div>

        {/* Standard Unicode symbols */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Standard</p>
        <div className="flex flex-wrap gap-1">
          {standardSymbols.map(sym => (
            <SymbolButton
              key={sym}
              sym={sym}
              isCurrent={sym === entry.symbol}
              isUsed={usedSymbols.has(sym)}
              onPick={() => onPick(sym)}
            />
          ))}
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
