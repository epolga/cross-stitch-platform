'use client';

import { useEffect, useRef } from 'react';
import { drawSymbol, isPUA } from '@/lib/symbol-renderer';

interface Props {
  symbol: string;
  size: number;       // CSS pixels (canvas will be DPR-scaled)
  color?: string;
  style?: React.CSSProperties;
}

export default function SymbolPreview({ symbol, size, color = '#000', style }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width  = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2;
    if (!isPUA(symbol)) {
      ctx.font = `bold ${Math.max(size - 4, 6)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    }
    drawSymbol(ctx, symbol, cx, cy, size, color);
  }, [symbol, size, color]);

  return <canvas ref={ref} style={style} />;
}
