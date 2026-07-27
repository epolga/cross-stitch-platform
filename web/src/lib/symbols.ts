// Cross-stitch symbols ordered by visual distinctiveness at small cell sizes.
// PUA U+E001–U+E020 are canvas-drawn (see symbol-renderer.ts); PDF falls back to entry numbers.
// Imported by both pattern-converter.ts (server) and SymbolPickerDialog (client).
const E = (n: number) => String.fromCodePoint(0xe000 + n);
export const SYMBOLS: string[] = [
  // Custom canvas-drawn symbols (PUA U+E001–U+E020) — most distinctive at small sizes
  E(1), E(2), E(3), E(4), E(5), E(6), E(7), E(8), E(9), E(10),
  E(11), E(12), E(13), E(14), E(15), E(16), E(17), E(18), E(19), E(20),
  // Solid shapes (most visually heavy — best at small sizes)
  '■', '▲', '▼', '◆', '●', '★', '▪', '▶', '◀',
  // Outline shapes
  '□', '△', '▽', '◇', '○', '☆', '▫',
  // Circled / boxed
  '⊕', '⊗', '⊙', '⊞', '⊠', '⊡',
  // Plus / cross family
  '+', '×', '✚', '✛',
  // Arrows
  '↑', '↓', '←', '→', '↔', '↕', '↗', '↘', '↙', '↖',
  // Math / set operators
  '÷', '=', '≠', '≡', '∅', '∞', '∧', '∨', '∩', '∪', '∇', '∗', '≈', '±',
  // Lines / slashes
  '|', '‖', '/', '\\', '¬',
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
