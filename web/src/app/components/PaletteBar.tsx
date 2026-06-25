'use client';

import { useState, useEffect } from 'react';
import type { PatternPalette } from '@/lib/pattern-converter';

interface Props {
  palette: PatternPalette[];
  selectedIndex: number;
  blinkIndex?: number | null;
  hiddenColors: Set<number>;
  onSelect: (index: number) => void;
  onRightClickSwatch?: (index: number) => void;
  onToggleColor: (index: number) => void;
  onToggleAll: (showAll: boolean) => void;
}

export default function PaletteBar({
  palette, selectedIndex, blinkIndex = null,
  hiddenColors, onSelect, onRightClickSwatch, onToggleColor, onToggleAll,
}: Props) {
  const sel = palette[selectedIndex];
  const [blinkOn, setBlinkOn] = useState(true);

  useEffect(() => {
    if (blinkIndex == null) { setBlinkOn(true); return; }
    setBlinkOn(true);
    const id = setInterval(() => setBlinkOn(b => !b), 280);
    return () => clearInterval(id);
  }, [blinkIndex]);

  const allVisible = hiddenColors.size === 0;

  return (
    <div className="flex flex-col items-center gap-2 px-2 py-2 bg-gray-100 rounded-lg border border-gray-200 self-stretch">
      {/* Active color preview */}
      <div className="flex flex-col items-center gap-1 flex-none">
        <div
          className="w-6 h-6 rounded border-2 border-gray-400"
          style={{ backgroundColor: sel ? `rgb(${sel.r},${sel.g},${sel.b})` : '#fff' }}
        />
        {sel && (
          <span className="text-[9px] font-mono text-gray-500 leading-tight text-center">
            {sel.symbol}
          </span>
        )}
      </div>

      <div className="w-full h-px bg-gray-300 flex-none" />

      {/* Toggle-all row */}
      {palette.length > 0 && (
        <label className="flex items-center gap-1 text-[9px] text-gray-500 cursor-pointer flex-none self-end pr-0.5">
          <span>All</span>
          <input
            type="checkbox"
            checked={allVisible}
            onChange={e => onToggleAll(e.target.checked)}
            style={{ width: 13, height: 13, cursor: 'pointer' }}
          />
        </label>
      )}

      {/* Swatches — color · symbol · visibility per row */}
      <div className="flex flex-col gap-1 overflow-y-auto flex-1">
        {palette.map((c, i) => {
          const isSelected = i === selectedIndex;
          const isBlink = i === blinkIndex && !blinkOn;
          const isHidden = hiddenColors.has(i);
          return (
            <button
              key={c.number}
              type="button"
              title={`${c.symbol}  DMC ${c.number} — ${c.name}`}
              onClick={() => onSelect(i)}
              onContextMenu={e => { e.preventDefault(); onRightClickSwatch?.(i); }}
              className="flex-none flex flex-row gap-0.5 rounded transition-transform hover:scale-105"
              style={{
                outline: isSelected ? '2px solid #e11d48' : 'none',
                outlineOffset: isSelected ? '2px' : '0',
                opacity: isBlink ? 0.15 : 1,
              }}
            >
              {/* Color square */}
              <span style={{
                display: 'block', width: 22, height: 22, flexShrink: 0,
                backgroundColor: `rgb(${c.r},${c.g},${c.b})`,
                border: '1px solid rgba(0,0,0,0.18)', borderRadius: 3,
                opacity: isHidden ? 0.35 : 1,
              }} />
              {/* Symbol square */}
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, flexShrink: 0,
                backgroundColor: '#fff',
                border: '1px solid rgba(0,0,0,0.18)', borderRadius: 3,
                fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold', color: '#000',
                userSelect: 'none', opacity: isHidden ? 0.35 : 1,
              }}>
                {c.symbol}
              </span>
              {/* Visibility checkbox square */}
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, flexShrink: 0,
                backgroundColor: isHidden ? '#f3f4f6' : '#fff',
                border: '1px solid rgba(0,0,0,0.18)', borderRadius: 3,
              }}>
                <input
                  type="checkbox"
                  checked={!isHidden}
                  onChange={() => onToggleColor(i)}
                  onClick={e => e.stopPropagation()}
                  style={{ width: 13, height: 13, cursor: 'pointer' }}
                />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
