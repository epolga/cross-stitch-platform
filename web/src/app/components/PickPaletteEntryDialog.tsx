'use client';

import type { PatternPalette } from '@/lib/pattern-converter';

interface Props {
  open: boolean;
  mode: 'moveTo' | 'mergeInto';
  sourceIndex: number;
  palette: PatternPalette[];
  onPick: (originalIndex: number) => void;
  onPickEnd?: () => void;       // only relevant for moveTo — "move to last position"
  onClose: () => void;
}

export default function PickPaletteEntryDialog({
  open, mode, sourceIndex, palette, onPick, onPickEnd, onClose,
}: Props) {
  if (!open || sourceIndex < 0 || sourceIndex >= palette.length) return null;

  const source = palette[sourceIndex];
  const others = palette
    .map((entry, i) => ({ entry, i }))
    .filter(({ i }) => i !== sourceIndex);

  const title  = mode === 'moveTo' ? 'Move to…' : 'Merge into…';
  const desc   = mode === 'moveTo'
    ? `Moving entry ${sourceIndex + 1}: ${source.symbol} DMC ${source.number} (${source.name}). Click which entry it should appear BEFORE.`
    : `Merging entry ${sourceIndex + 1}: ${source.symbol} DMC ${source.number} (${source.name}). All its stitches will become the chosen color. This entry will be removed.`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-96 max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 flex-none">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
        </div>

        <p className="text-sm text-gray-500 mb-3 flex-none">{desc}</p>

        <div className="overflow-y-auto flex-1 flex flex-col gap-1">
          {others.map(({ entry, i }) => (
            <button
              key={entry.number}
              type="button"
              onClick={() => onPick(i)}
              className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg border border-gray-200 hover:bg-rose-50 hover:border-rose-300 transition-colors"
            >
              <span className="text-xs font-mono text-gray-400 w-5 shrink-0 text-right">{i + 1}</span>
              <span
                style={{
                  width: 20, height: 20, flexShrink: 0, borderRadius: 3,
                  backgroundColor: `rgb(${entry.r},${entry.g},${entry.b})`,
                  border: '1px solid rgba(0,0,0,0.2)',
                  display: 'inline-block',
                }}
              />
              <span className="font-mono text-sm font-bold text-gray-800 w-5 shrink-0 text-center">{entry.symbol}</span>
              <span className="text-sm text-gray-700 truncate">DMC {entry.number} — {entry.name}</span>
            </button>
          ))}

          {mode === 'moveTo' && onPickEnd && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button
                type="button"
                onClick={onPickEnd}
                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg border border-dashed border-gray-300 hover:bg-gray-50 text-sm text-gray-500 transition-colors"
              >
                Move to last position ({palette.length})
              </button>
            </>
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
