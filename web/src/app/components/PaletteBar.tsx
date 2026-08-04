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
  remainingCounts?: number[]; // stitches left per palette entry — shown only in Stitch Mode
  totalCounts?: number[]; // live total stitches per palette entry, recomputed from the grid
  onSelect: (index: number) => void;
  onBlink: (index: number) => void;
  onToggleColor: (index: number) => void;
  onToggleAll: (showAll: boolean) => void;
  onChangeColor: (index: number) => void;
  onChangeSymbol: (index: number) => void;
  onMoveTo: (index: number) => void;
  onMergeInto: (index: number) => void;
  onDeleteColor: (index: number) => void;
  onAddColor?: () => void;
}

type EditMenu = { index: number; top: number; right: number };

const PaletteBar = forwardRef<PaletteBarHandle, Props>(function PaletteBar({
  palette, selectedIndex, blinkIndex = null,
  hiddenColors, maxHeight, remainingCounts, totalCounts, onSelect, onBlink, onToggleColor, onToggleAll,
  onChangeColor, onChangeSymbol, onMoveTo, onMergeInto, onDeleteColor, onAddColor,
}: Props, ref) {
  const sel = palette[selectedIndex];
  const [blinkOn, setBlinkOn] = useState(true);
  const [editMenu, setEditMenu] = useState<EditMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollHint, setScrollHint] = useState({ top: false, bottom: false });
  useImperativeHandle(ref, () => ({
    scrollTo(index: number) {
      rowRefs.current[index]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
  }));

  // Same edge-hint pattern as the pattern canvas (ConvertClient.tsx): a
  // capped-height, internally-scrolling list gives no native cue on mobile
  // that there's more to scroll to, since the OS hides scrollbars until
  // actively scrolling.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    function updateScrollHint() {
      if (!el) return;
      setScrollHint({
        top: el.scrollTop > 1,
        bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
      });
    }
    updateScrollHint();
    el.addEventListener('scroll', updateScrollHint, { passive: true });
    const ro = new ResizeObserver(updateScrollHint);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollHint);
      ro.disconnect();
    };
  }, [palette.length, maxHeight]);

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

  // Clamped to maxHeight when one's given, so the two never conflict — an
  // unclamped minHeight can otherwise win over a smaller maxHeight (per the
  // CSS spec, min-height overrides max-height), which would silently
  // defeat the mobile-stacked-layout cap in ConvertClient.tsx for any
  // palette with 16+ colors.
  const naturalMinHeight = Math.min(palette.length, 16) * 22 + 180;
  const resolvedMinHeight = maxHeight ? Math.min(naturalMinHeight, maxHeight) : naturalMinHeight;

  const squareBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 18, height: 18, flexShrink: 0,
    border: '1px solid rgba(0,0,0,0.18)', borderRadius: 3,
    userSelect: 'none',
  };

  return (
    <div className="flex flex-col items-center gap-2 px-2 py-2 bg-gray-100 rounded-lg border border-gray-200 self-stretch overflow-hidden" style={{ minWidth: 118, minHeight: resolvedMinHeight, ...(maxHeight ? { maxHeight } : {}) }}>

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
        <button
          type="button"
          title={allVisible ? 'All colors visible — click to hide all' : 'Some colors hidden — click to show all'}
          onClick={() => onToggleAll(!allVisible)}
          className="flex items-center gap-1 text-[9px] text-gray-500 cursor-pointer flex-none self-end pr-0.5 hover:text-gray-800"
        >
          <span>All</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: allVisible ? '#9ca3af' : '#d1d5db' }}>
            {allVisible ? (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </>
            ) : (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </>
            )}
          </svg>
        </button>
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
      <div className="relative flex-1 min-h-0 w-full">
      <div ref={listRef} className="absolute inset-0 flex flex-col gap-1 overflow-y-auto">
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
                title={`DMC ${c.number} — ${c.name} (${totalCounts?.[i] ?? c.stitchCount} stitches) — click to select`}
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

              {/* Stitch-count badge: remaining/total while stitching, live total otherwise */}
              {remainingCounts ? (
                <span
                  title={`${remainingCounts[i] ?? c.stitchCount} of ${totalCounts?.[i] ?? c.stitchCount} stitches left`}
                  className="flex-none text-[9px] font-mono text-gray-500 px-1"
                  style={{ minWidth: 20, textAlign: 'right' }}
                >
                  {remainingCounts[i] ?? c.stitchCount}
                </span>
              ) : totalCounts && (
                <span
                  title={`${totalCounts[i] ?? c.stitchCount} stitches in this design`}
                  className="flex-none text-[9px] font-mono text-gray-400 px-1"
                  style={{ minWidth: 20, textAlign: 'right' }}
                >
                  {totalCounts[i] ?? c.stitchCount}
                </span>
              )}

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

              {/* Visibility eye */}
              <button
                type="button"
                title={isHidden ? 'Hidden — click to show' : 'Visible — click to hide while stitching'}
                onClick={() => onToggleColor(i)}
                style={{ ...squareBase, backgroundColor: isHidden ? '#f3f4f6' : '#fff', color: isHidden ? '#9ca3af' : '#374151', cursor: 'pointer' }}
                className="hover:bg-gray-200"
              >
                {isHidden ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          );
        })}
      </div>{/* end scrollable list */}
      {scrollHint.top && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-6 z-20 bg-gradient-to-b from-black/20 to-transparent" />
          <div className="pointer-events-none absolute left-1/2 top-1 z-20 -translate-x-1/2 flex items-center justify-center w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] shadow-md ring-2 ring-white/80">︿</div>
        </>
      )}
      {scrollHint.bottom && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 z-20 bg-gradient-to-t from-black/20 to-transparent" />
          <div className="pointer-events-none absolute left-1/2 bottom-1 z-20 -translate-x-1/2 flex items-center justify-center w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] shadow-md ring-2 ring-white/80">﹀</div>
        </>
      )}
      </div>{/* end relative wrapper */}

      {/* Tips */}
      {palette.length > 0 && (
        <div className="flex-none w-full mt-1 pt-1.5 border-t border-gray-300 text-[9px] text-gray-400 leading-relaxed space-y-0.5 px-0.5">
          <div title="Click any color swatch to make all its stitches flash on the canvas">Click swatch → flash in chart</div>
          <div title="Click the eye icon next to any color to hide it — stitch one color at a time">👁 Eye → hide while stitching</div>
          {(remainingCounts || totalCounts) && (
            <div title="Number of stitches of that color — remaining while stitching, total otherwise">
              123 → stitch count
            </div>
          )}
        </div>
      )}

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
            <div className="border-t border-gray-100 my-1" />
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              onClick={() => { onDeleteColor(editMenu.index); setEditMenu(null); }}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
});

export default PaletteBar;
