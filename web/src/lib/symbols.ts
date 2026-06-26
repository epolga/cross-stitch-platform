// Cross-stitch symbols ordered by visual distinctiveness at small cell sizes.
// Imported by both pattern-converter.ts (server) and SymbolPickerDialog (client).
export const SYMBOLS: string[] = [
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
