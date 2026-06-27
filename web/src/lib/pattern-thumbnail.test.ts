import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub document.createElement before calling the function.
// The module uses document lazily (inside the function body), so importing
// first and stubbing before tests is safe.
import { generatePatternThumbnail } from './pattern-thumbnail';
import type { PatternPalette } from './pattern-converter';

const RED: PatternPalette  = { number: '666', name: 'Red',  r: 200, g: 0, b: 0,   symbol: 'X', stitchCount: 0 };
const BLUE: PatternPalette = { number: '825', name: 'Blue', r: 0,   g: 0, b: 200, symbol: 'O', stitchCount: 0 };

type FakeCtx = { fillStyle: string; fillRect: ReturnType<typeof vi.fn> };
type FakeCanvas = {
  width: number; height: number;
  getContext: ReturnType<typeof vi.fn>;
  toDataURL: ReturnType<typeof vi.fn>;
};

let lastCtx: FakeCtx;
let lastCanvas: FakeCanvas;

beforeAll(() => {
  vi.stubGlobal('document', {
    createElement: vi.fn((_tag: string) => {
      lastCtx = { fillStyle: '', fillRect: vi.fn() };
      lastCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => lastCtx),
        toDataURL: vi.fn(() => 'data:image/jpeg;base64,/9j/test'),
      };
      return lastCanvas;
    }),
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generatePatternThumbnail', () => {
  it('returns empty string for an empty grid', () => {
    expect(generatePatternThumbnail([], [RED])).toBe('');
  });

  it('returns empty string when grid has no columns', () => {
    expect(generatePatternThumbnail([[]], [RED])).toBe('');
  });

  it('returns the canvas data URL for a valid grid', () => {
    const result = generatePatternThumbnail([[0, 1], [1, 0]], [RED, BLUE]);
    expect(result).toBe('data:image/jpeg;base64,/9j/test');
    expect(lastCanvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.65);
  });

  it('sets canvas dimensions based on cell size', () => {
    // 2 cols, 1 row, maxW=240, maxH=160 → cellSize = min(120, 160) = 120
    generatePatternThumbnail([[0, 1]], [RED, BLUE], 240, 160);
    expect(lastCanvas.width).toBe(240);   // 2 * 120
    expect(lastCanvas.height).toBe(120);  // 1 * 120
  });

  it('caps cell size so canvas does not exceed maxW', () => {
    // 100 cols, 1 row, maxW=240 → cellSize = floor(240/100) = 2
    const grid = [Array(100).fill(0)];
    generatePatternThumbnail(grid, [RED], 240, 160);
    expect(lastCanvas.width).toBe(200);   // 100 * 2
    expect(lastCanvas.height).toBe(2);    // 1 * 2
  });

  it('draws background fill before painting cells', () => {
    generatePatternThumbnail([[0]], [RED]);
    const calls = lastCtx.fillRect.mock.calls as number[][];
    // First call is always the full background rect
    expect(calls[0]).toEqual([0, 0, lastCanvas.width, lastCanvas.height]);
  });

  it('skips cells with index -1 (empty)', () => {
    generatePatternThumbnail([[-1, 0]], [RED]);
    // Only background + one colored cell (2 fillRect calls)
    expect(lastCtx.fillRect).toHaveBeenCalledTimes(2);
  });

  it('uses rgb() fill style matching palette color', () => {
    generatePatternThumbnail([[0]], [RED]);
    expect(lastCtx.fillStyle).toBe('rgb(200,0,0)');
  });
});
