import { describe, expect, it } from 'vitest';
import { diffPatterns, isEmptyDiff } from './ai-design-corrections';
import type { PatternPalette } from './pattern-converter';

function color(number: string): PatternPalette {
  return { number, name: number, r: 0, g: 0, b: 0, symbol: 'X', stitchCount: 0 };
}

describe('diffPatterns', () => {
  it('reports no changes for an identical grid/palette', () => {
    const grid = [[0, 1], [1, 0]];
    const palette = [color('310'), color('blanc')];
    const diff = diffPatterns({ grid, palette }, { grid, palette });
    expect(diff.dimensionsChanged).toBe(false);
    expect(diff.cellsChanged).toBe(0);
    expect(diff.colorsAdded).toEqual([]);
    expect(diff.colorsRemoved).toEqual([]);
    expect(diff.colorsUnchanged).toBe(2);
    expect(isEmptyDiff(diff)).toBe(true);
  });

  it('does not count a diff when only palette order changes, same colors per cell', () => {
    const beforeGrid = [[0, 1]];
    const beforePalette = [color('310'), color('blanc')];
    // Same cells, same actual DMC colors, but palette array reordered and
    // grid indices updated to match — e.g. what removeUnusedColors() does.
    const afterGrid = [[1, 0]];
    const afterPalette = [color('blanc'), color('310')];

    const diff = diffPatterns(
      { grid: beforeGrid, palette: beforePalette },
      { grid: afterGrid, palette: afterPalette },
    );
    expect(diff.cellsChanged).toBe(0);
    expect(isEmptyDiff(diff)).toBe(true);
  });

  it('counts cells whose resolved DMC color actually changed', () => {
    const before = { grid: [[0, 1], [1, 0]], palette: [color('310'), color('blanc')] };
    const after = { grid: [[0, 0], [1, 0]], palette: [color('310'), color('blanc')] };
    const diff = diffPatterns(before, after);
    expect(diff.cellsChanged).toBe(1);
    expect(isEmptyDiff(diff)).toBe(false);
  });

  it('reports added and removed colors', () => {
    const before = { grid: [[0, 1]], palette: [color('310'), color('blanc')] };
    const after = { grid: [[0, 2]], palette: [color('310'), color('blanc'), color('321')] };
    // blanc (idx 1) no longer used by any cell, 321 (idx 2) newly used —
    // but colorsAdded/Removed compares palette membership, not usage, so
    // "blanc" still counts as present in both palettes here (still in the
    // after-palette array even if 0 cells reference it); this test checks
    // the palette-membership diff specifically, not usage.
    const diff = diffPatterns(before, after);
    expect(diff.colorsAdded).toEqual(['321']);
    expect(diff.colorsRemoved).toEqual([]);
    expect(diff.colorsUnchanged).toBe(2);
  });

  it('flags dimensionsChanged and returns null cellsChanged on resize (e.g. Size to Design)', () => {
    const before = { grid: [[0, 1], [1, 0]], palette: [color('310'), color('blanc')] };
    const after = { grid: [[0]], palette: [color('310')] };
    const diff = diffPatterns(before, after);
    expect(diff.dimensionsChanged).toBe(true);
    expect(diff.cellsChanged).toBeNull();
    expect(diff.beforeDimensions).toEqual({ width: 2, height: 2 });
    expect(diff.afterDimensions).toEqual({ width: 1, height: 1 });
    expect(isEmptyDiff(diff)).toBe(false);
  });
});
