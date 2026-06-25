'use client';

import { useEffect, useRef } from 'react';
import type { PatternPalette } from '@/lib/pattern-converter';

const ML = 30; // left margin for row numbers
const MT = 18; // top margin for column numbers

interface Props {
  grid: number[][];
  palette: PatternPalette[];
  mode: 'color' | 'symbol' | 'both';
  cellSize?: number;
  editable?: boolean;
  activeTool?: 'pencil' | 'fill' | 'erase-fill';
  onPaint?: (row: number, col: number) => void;
  onFill?: (row: number, col: number) => void;
  onStrokeStart?: () => void;
  onStrokeEnd?: () => void;
}

export default function PatternCanvas({
  grid, palette, mode, cellSize = 12,
  editable, activeTool,
  onPaint, onFill, onStrokeStart, onStrokeEnd,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rows = grid.length;
    const cols = grid[0].length;
    canvas.width = cols * cellSize + ML;
    canvas.height = rows * cellSize + MT;

    // Margin backgrounds
    ctx.fillStyle = '#ddd';
    ctx.fillRect(0, 0, ML, canvas.height);
    ctx.fillRect(0, 0, canvas.width, MT);

    // Cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ci = grid[r][c];
        const color = ci === -1 ? null : palette[ci];
        const px = c * cellSize + ML;
        const py = r * cellSize + MT;

        if (!color) {
          // Blank / erased cell — white with subtle hatching
          ctx.fillStyle = '#fff';
          ctx.fillRect(px, py, cellSize, cellSize);
          ctx.strokeStyle = 'rgba(0,0,0,0.13)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(px, py, cellSize, cellSize);
          continue;
        }

        ctx.fillStyle = (mode === 'color' || mode === 'both')
          ? `rgb(${color.r},${color.g},${color.b})`
          : '#fff';
        ctx.fillRect(px, py, cellSize, cellSize);

        ctx.strokeStyle = 'rgba(0,0,0,0.13)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, cellSize, cellSize);

        if (mode === 'symbol' || mode === 'both') {
          const brightness = color.r + color.g + color.b;
          ctx.fillStyle = mode === 'both' ? (brightness > 382 ? '#000' : '#fff') : '#000';
          ctx.font = `bold ${Math.max(cellSize - 4, 6)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(color.symbol, px + cellSize / 2, py + cellSize / 2);
        }
      }
    }

    // Bold grid lines every 10 cells
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    for (let r = 0; r <= rows; r += 10) {
      const y = r * cellSize + MT;
      ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(ML + cols * cellSize, y); ctx.stroke();
    }
    for (let c = 0; c <= cols; c += 10) {
      const x = c * cellSize + ML;
      ctx.beginPath(); ctx.moveTo(x, MT); ctx.lineTo(x, MT + rows * cellSize); ctx.stroke();
    }

    // Row numbers every 5
    ctx.fillStyle = '#666';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let r = 4; r < rows; r += 5) {
      ctx.fillText(String(r + 1), ML - 3, r * cellSize + MT + cellSize / 2);
    }

    // Column numbers every 5
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (let c = 4; c < cols; c += 5) {
      ctx.fillText(String(c + 1), c * cellSize + ML + cellSize / 2, MT - 2);
    }
  }, [grid, palette, mode, cellSize]);

  function cellAt(e: React.MouseEvent<HTMLCanvasElement>): [number, number] | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const col = Math.floor(((e.clientX - rect.left) * sx - ML) / cellSize);
    const row = Math.floor(((e.clientY - rect.top) * sy - MT) / cellSize);
    const rows = grid.length, cols = grid[0]?.length ?? 0;
    if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
    return [row, col];
  }

  function onDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!editable || e.button !== 0) return;
    const cell = cellAt(e);
    if (!cell) return;
    if (activeTool === 'fill' || activeTool === 'erase-fill') {
      onFill?.(cell[0], cell[1]);
    } else {
      drawing.current = true;
      onStrokeStart?.();
      onPaint?.(cell[0], cell[1]);
    }
  }

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!editable || !drawing.current || activeTool !== 'pencil') return;
    const cell = cellAt(e);
    if (cell) onPaint?.(cell[0], cell[1]);
  }

  function onUp() {
    if (drawing.current) { drawing.current = false; onStrokeEnd?.(); }
  }

  const cursor = !editable ? 'default'
    : (activeTool === 'fill' || activeTool === 'erase-fill') ? 'cell'
    : 'crosshair';

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', imageRendering: 'pixelated', cursor }}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onUp}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
