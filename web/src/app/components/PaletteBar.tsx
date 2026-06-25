'use client';

import { useState, useEffect } from 'react';
import type { PatternPalette } from '@/lib/pattern-converter';

interface Props {
  palette: PatternPalette[];
  selectedIndex: number;
  blinkIndex?: number | null;
  onSelect: (index: number) => void;
  onRightClickSwatch?: (index: number) => void;
}

export default function PaletteBar({ palette, selectedIndex, blinkIndex = null, onSelect, onRightClickSwatch }: Props) {
  const sel = palette[selectedIndex];
  const [blinkOn, setBlinkOn] = useState(true);

  useEffect(() => {
    if (blinkIndex == null) { setBlinkOn(true); return; }
    setBlinkOn(true);
    const id = setInterval(() => setBlinkOn(b => !b), 280);
    return () => clearInterval(id);
  }, [blinkIndex]);

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

      {/* Swatches column */}
      <div className="flex flex-col gap-1 overflow-y-auto flex-1">
        {palette.map((c, i) => (
          <button
            key={c.number}
            type="button"
            title={`${c.symbol}  DMC ${c.number} — ${c.name}`}
            onClick={() => onSelect(i)}
            onContextMenu={(e) => { e.preventDefault(); onRightClickSwatch?.(i); }}
            className="flex-none rounded transition-transform hover:scale-110"
            style={{
              width: 22,
              height: 22,
              backgroundColor: `rgb(${c.r},${c.g},${c.b})`,
              outline: i === selectedIndex
                ? '2.5px solid #e11d48'
                : '1px solid rgba(0,0,0,0.18)',
              outlineOffset: i === selectedIndex ? '2px' : '0',
              transform: i === selectedIndex ? 'scale(1.15)' : undefined,
              opacity: i === blinkIndex && !blinkOn ? 0.15 : 1,
            }}
          />
        ))}
      </div>
    </div>
  );
}
