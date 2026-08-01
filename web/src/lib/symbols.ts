// Cross-stitch symbols ordered by visual distinctiveness at small cell sizes.
// PUA U+E001–U+E020 are canvas-drawn (see symbol-renderer.ts); PDF falls back to entry numbers.
// Imported by both pattern-converter.ts (server) and SymbolPickerDialog (client).
const E = (n: number) => String.fromCodePoint(0xe000 + n);
export const SYMBOLS: string[] = [
  // StitchCraft library symbols (PUA U+E015–U+E03C) — Olga's picks from the
  // original charting software's own sc_sym.dll (2026-08), take priority
  // over everything below. 16 near-duplicates already covered by these were
  // removed from the sets further down rather than left as redundant twins.
  E(21), E(22), E(23), E(24), E(25), E(26), E(27), E(28), E(29), E(30),
  E(31), E(32), E(33), E(34), E(35), E(36), E(37), E(38), E(39), E(40),
  E(41), E(42), E(43), E(44), E(45), E(46), E(47), E(48), E(49), E(50),
  E(51), E(52), E(53), E(54), E(55), E(56), E(57), E(58), E(59), E(60),
  // Custom canvas-drawn symbols (PUA U+E001–U+E020, minus E8/E17/E20 — now
  // covered by StitchCraft equivalents above) — most distinctive at small sizes
  E(1), E(2), E(3), E(4), E(5), E(6), E(7), E(9), E(10),
  E(11), E(12), E(13), E(14), E(15), E(16), E(18), E(19),
  // Solid shapes (most visually heavy — best at small sizes)
  '▼', '◆', '▪', '▶', '◀',
  // Outline shapes
  '△', '▽', '◇', '☆', '▫',
  // Circled / boxed
  '⊞',
  // Plus / cross family
  '✚', '✛',
  // Arrows
  '↑', '↓', '←', '→', '↔', '↕', '↗', '↘', '↙', '↖',
  // Math / set operators
  '÷', '≠', '≡', '∅', '∞', '∧', '∨', '∩', '∪', '∇', '∗', '≈', '±',
  // Lines / slashes
  '/', '\\', '¬',
  // Greek letters (distinct from Latin)
  'Σ', 'Δ', 'Λ', 'Φ', 'Ψ', 'Ω', 'λ', 'μ',
  // Latin uppercase / lowercase (fallback for large palettes)
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'abcdefghijklmnopqrstuvwxyz',
  // ASCII misc
  '!', '#', '$', '%', '&', '<', '>', '?', '@', '^', '~', ':', ';', '*', '-', '·',
];

// Palettes past SYMBOLS.length (e.g. reverse-parsed catalog PDFs with 150+
// DMC colors, unlike our own converter which caps the color-limit dropdown
// at 25) used to all collapse onto the same '?' glyph, making every
// overflow color visually indistinguishable on the chart. Plain numbers
// (no digit appears anywhere in SYMBOLS[], so no collision) at least keep
// every color distinct, the same convention commercial chart software
// falls back to for very large palettes.
export function symbolForIndex(i: number): string {
  return SYMBOLS[i] ?? String(i - SYMBOLS.length + 1);
}
