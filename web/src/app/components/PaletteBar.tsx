'use client';

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import type { PatternPalette } from '@/lib/pattern-converter';
import { isPUA } from '@/lib/symbol-renderer';
import SymbolPreview from '@/app/components/SymbolPreview';

export type PaletteBarHandle = { scrollTo(index: number): void };

interface Props {
  palette: PatternPalette[];
  selectedIndex: number;
  blinkIndex?: number | null;
  hiddenColors: Set<number>;
  maxHeight?: number;
  onSelect: (index: number) => void;
  onBlink: (index: number) => void;
  onToggleColor: (index: number) => void;
  onToggleAll: (showAll: boolean) => void;
  onChangeColor: (index: number) => void;
  onChangeSymbol: (index: number) => void;
  onMoveTo: (index: number) => void;
  onMergeInto: (index: number) => void;
  onAddColor?: () => void;
}

type EditMenu = { index: number; top: number; right: number };

const PaletteBar = forwardRef<PaletteBarHandle, Props>(function PaletteBar({
  palette, selectedIndex, blinkIndex = null,
  hiddenColors, maxHeight, onSelect, onBlink, onToggleColor, onToggleAll,
  onChangeColor, onChangeSymbol, onMoveTo, onMergeInto, onAddColor,
}: Props, ref) {
  const sel = palette[selectedIndex];
  const [blinkOn, setBlinkOn] = useState(true);
  const [editMenu, setEditMenu] = useState<EditMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  useImperativeHandle(ref, () => ({
    scrollTo(index: number) {
      rowRefs.current[index]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
  }));

  useEffect(() => {
    if (blinkIndex == null) { setBlinkOn(true); return; }
    setBlinkOn(true);
    const id = setInterval(() => setBlinkOn(b => !b), 280);
    return () => clearInterval(id);
  }, [blinkIndex]);

  function openEditMenu(e: React.MouseEvent, index: number) {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEditMenu({ index, top: rect.top, right: window.innerWidth - rect.left + 4 });
  }

  const allVisible = hiddenColors.size === 0;

  const squareBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 18, height: 18, flexShrink: 0,
    border: '1px solid rgba(0,0,0,0.18)', borderRadius: 3,
    userSelect: 'none',
  };

  return (
    <div className="flex flex-col items-center gap-2 px-2 py-2 bg-gray-100 rounded-lg border border-gray-200 self-stretch overflow-hidden" style={{ minWidth: 118, minHeight: Math.min(palette.length, 16) * 22 + 180, ...(maxHeight ? { maxHeight } : {}) }}>

      {/* Active color preview */}
      <div className="flex flex-col items-center gap-1 flex-none">
        <div
          className="w-6 h-6 rounded border-2 border-gray-400"
          style={{ backgroundColor: sel ? `rgb(${sel.r},${sel.g},${sel.b})` : '#fff' }}
        />
        {sel && (
          isPUA(sel.symbol)
            ? <SymbolPreview symbol={sel.symbol} size={14} color="#6b7280" />
            : <span className="text-[9px] font-mono text-gray-500 leading-tight text-center">{sel.symbol}</span>
        )}
      </div>

      <div className="w-full h-px bg-gray-300 flex-none" />

      {/* Toggle-all row */}
      {palette.length > 0 && (
        <label
          title={allVisible ? 'All colors visible — click to hide all' : 'Some colors hidden — click to show all'}
          className="flex items-center gap-1 text-[9px] text-gray-500 cursor-pointer flex-none self-end pr-0.5"
        >
          <span>All</span>
          <input
            type="checkbox"
            checked={allVisible}
            onChange={e => onToggleAll(e.target.checked)}
            style={{ width: 13, height: 13, cursor: 'pointer' }}
          />
        </label>
      )}

      {/* Add color button */}
      {onAddColor && (
        <button
          type="button"
          title="Add a new DMC color to the palette"
          onClick={onAddColor}
          className="flex-none w-full py-1 text-[10px] text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded border border-dashed border-gray-300 hover:border-gray-400 transition-colors"
        >
          + Add color
        </button>
      )}

      {/* Swatches */}
      <div className="flex flex-col gap-1 overflow-y-auto flex-1">
        {palette.map((c, i) => {
          const isSelected = i === selectedIndex;
          const isBlink   = i === blinkIndex && !blinkOn;
          const isHidden  = hiddenColors.has(i);

          const handleClick = () => { onSelect(i); onBlink(i); };

          return (
            <div
              key={c.number}
              ref={el => { rowRefs.current[i] = el; }}
              className="flex-none flex flex-row items-center gap-0.5 rounded"
              style={{
                outline: isSelected ? '2px solid #e11d48' : 'none',
                outlineOffset: isSelected ? '2px' : '0',
                opacity: isBlink ? 0.15 : 1,
              }}
            >
              {/* Index number */}
              <span
                title={`Entry ${i + 1} — click to select and highlight in canvas`}
                onClick={handleClick}
                style={{
                  ...squareBase,
                  fontSize: 11, fontFamily: 'monospace', color: '#6b7280',
                  backgroundColor: '#f3f4f6', cursor: 'pointer',
                  width: 22,
                }}
              >
                {i + 1}
              </span>

              {/* Color square */}
              <span
                title={`DMC ${c.number} — ${c.name} (${c.stitchCount} stitches) — click to select`}
                onClick={handleClick}
                style={{
                  ...squareBase,
                  backgroundColor: `rgb(${c.r},${c.g},${c.b})`,
                  opacity: isHidden ? 0.35 : 1,
                  cursor: 'pointer',
                }}
              />

              {/* Symbol square */}
              <span
                title={`Symbol: click to select`}
                onClick={handleClick}
                style={{
                  ...squareBase,
                  backgroundColor: '#fff',
                  opacity: isHidden ? 0.35 : 1,
                  cursor: 'pointer',
                  overflow: 'hidden',
                }}
              >
                {isPUA(c.symbol)
                  ? <SymbolPreview symbol={c.symbol} size={14} color="#000" />
                  : <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 'bold', color: '#000' }}>{c.symbol}</span>
                }
              </span>

              {/* Edit button */}
              <button
                type="button"
                title="Edit entry — change color, symbol, move or merge"
                onClick={e => openEditMenu(e, i)}
                style={{
                  ...squareBase,
                  backgroundColor: '#fff',
                  color: '#6b7280',
                  cursor: 'pointer', border: '1px solid rgba(0,0,0,0.18)',
                }}
                className="hover:bg-gray-50 hover:text-gray-900"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                </svg>
              </button>

              {/* Visibility checkbox */}
              <span
                title={isHidden ? 'Hidden — click to show' : 'Visible — click to hide'}
                style={{ ...squareBase, backgroundColor: isHidden ? '#f3f4f6' : '#fff' }}
              >
                <input
                  type="checkbox"
                  checked={!isHidden}
                  onChange={() => onToggleColor(i)}
                  style={{ width: 13, height: 13, cursor: 'pointer' }}
                />
              </span>
            </div>
          );
        })}
      </div>

      {/* Edit dropdown menu */}
      {editMenu !== null && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setEditMenu(null)} />
          <div
            ref={menuRef}
            className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 w-44"
            style={{ top: editMenu.top, right: editMenu.right }}
          >
            {[
              { label: 'Change Color', action: onChangeColor },
              { label: 'Change Symbol', action: onChangeSymbol },
            ].map(({ label, action }) => (
              <button
                key={label}
                type="button"
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => { action(editMenu.index); setEditMenu(null); }}
              >
                {label}
              </button>
            ))}
            <div className="border-t border-gray-100 my-1" />
            {[
              { label: 'Move to…', action: onMoveTo },
              { label: 'Merge into…', action: onMergeInto },
            ].map(({ label, action }) => (
              <button
                key={label}
                type="button"
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => { action(editMenu.index); setEditMenu(null); }}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

export default PaletteBar;
