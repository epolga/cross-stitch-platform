'use client';

import { useEffect, useRef } from 'react';
import type { PatternPalette } from '@/lib/pattern-converter';

interface Props {
  grid: number[][];
  palette: PatternPalette[];
  mode: 'color' | 'symbol';
  cellSize?: number;
}

export default function PatternCanvas({ grid, palette, mode, cellSize = 12 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rows = grid.length;
    const cols = grid[0].length;
    canvas.width = cols * cellSize;
    canvas.height = rows * cellSize;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ci = grid[y][x];
        const c = palette[ci];
        const px = x * cellSize;
        const py = y * cellSize;

        if (mode === 'color') {
          ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
          ctx.fillRect(px, py, cellSize, cellSize);
          ctx.strokeStyle = 'rgba(0,0,0,0.12)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(px, py, cellSize, cellSize);
        } else {
          ctx.fillStyle = '#fff';
          ctx.fillRect(px, py, cellSize, cellSize);
          ctx.strokeStyle = '#aaa';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(px, py, cellSize, cellSize);
          ctx.fillStyle = '#000';
          ctx.font = `${Math.max(cellSize - 4, 6)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(c.symbol, px + cellSize / 2, py + cellSize / 2);
        }
      }
    }
  }, [grid, palette, mode, cellSize]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', imageRendering: 'pixelated' }}
    />
  );
}
