// Custom cross-stitch symbol renderer.
// PUA characters U+E001-U+E014 are IDs for canvas-drawn symbols.
// drawSymbol() dispatches: PUA -> draw function, anything else -> fillText.
//
// Pixel-snapping rules used throughout:
//   Fills  → integer coordinates  (Math.round)
//   Strokes → n + 0.5 offset      (sharp 1px lines on any display)
//   lineWidth → integer           (Math.max(1, Math.round(...)))

export type SymbolDrawFn = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,   // cell size in canvas pixels
) => void;

// Snap to integer (for fills / arc centers)
const ri = Math.round;
// Snap to n+0.5 (for strokes)
const rs = (n: number) => Math.round(n) + 0.5;

// ── Draw functions ────────────────────────────────────────────────────────────

function hatch(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const h = ri(s * 0.72);
  const half = ri(h / 2);
  const x0 = ri(cx) - half, y0 = ri(cy) - half;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, h, h); ctx.clip();
  ctx.lineWidth = 1; ctx.lineCap = 'butt';
  const step = ri(h / 3);
  for (let i = -1; i <= 3; i++) {
    const ox = x0 + i * step;
    ctx.beginPath();
    ctx.moveTo(ox,     y0 + h);
    ctx.lineTo(ox + h, y0);
    ctx.stroke();
  }
  ctx.restore();
}

function crossHatch(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const h = ri(s * 0.72);
  const half = ri(h / 2);
  const x0 = ri(cx) - half, y0 = ri(cy) - half;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, h, h); ctx.clip();
  ctx.lineWidth = 1; ctx.lineCap = 'butt';
  const step = ri(h / 3);
  for (let i = -1; i <= 3; i++) {
    const ox = x0 + i * step;
    ctx.beginPath();
    ctx.moveTo(ox,     y0 + h); ctx.lineTo(ox + h, y0); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox,     y0);     ctx.lineTo(ox + h, y0 + h); ctx.stroke();
  }
  ctx.restore();
}

function checkerboard(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const h = ri(s * 0.72);
  const half = ri(h / 2);
  const x0 = ri(cx) - half, y0 = ri(cy) - half;
  const q = ri(h / 2);
  ctx.fillRect(x0,     y0,     q, q);
  ctx.fillRect(x0 + q, y0 + q, q, q);
}

function topHalf(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const r = ri(s * 0.36);
  ctx.beginPath(); ctx.arc(ri(cx), ri(cy), r, Math.PI, 0, false); ctx.closePath(); ctx.fill();
}

function bottomHalf(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const r = ri(s * 0.36);
  ctx.beginPath(); ctx.arc(ri(cx), ri(cy), r, 0, Math.PI, false); ctx.closePath(); ctx.fill();
}

function leftHalf(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const r = ri(s * 0.36);
  ctx.beginPath(); ctx.arc(ri(cx), ri(cy), r, Math.PI / 2, 3 * Math.PI / 2, false); ctx.closePath(); ctx.fill();
}

function rightHalf(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const r = ri(s * 0.36);
  ctx.beginPath(); ctx.arc(ri(cx), ri(cy), r, -Math.PI / 2, Math.PI / 2, false); ctx.closePath(); ctx.fill();
}

function concentricSquares(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.lineWidth = 1;
  const outer = ri(s * 0.70);
  const oh = ri(outer / 2);
  ctx.strokeRect(rs(ri(cx) - oh), rs(ri(cy) - oh), outer - 1, outer - 1);
  const inner = ri(s * 0.36);
  const ih = ri(inner / 2);
  ctx.strokeRect(rs(ri(cx) - ih), rs(ri(cy) - ih), inner - 1, inner - 1);
}

function topRightTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const h = ri(s * 0.70);
  const x0 = ri(cx) - ri(h / 2), y0 = ri(cy) - ri(h / 2);
  ctx.beginPath();
  ctx.moveTo(x0,     y0);
  ctx.lineTo(x0 + h, y0);
  ctx.lineTo(x0 + h, y0 + h);
  ctx.closePath(); ctx.fill();
}

function bottomLeftTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const h = ri(s * 0.70);
  const x0 = ri(cx) - ri(h / 2), y0 = ri(cy) - ri(h / 2);
  ctx.beginPath();
  ctx.moveTo(x0,     y0);
  ctx.lineTo(x0,     y0 + h);
  ctx.lineTo(x0 + h, y0 + h);
  ctx.closePath(); ctx.fill();
}

function topLeftTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const h = ri(s * 0.70);
  const x0 = ri(cx) - ri(h / 2), y0 = ri(cy) - ri(h / 2);
  ctx.beginPath();
  ctx.moveTo(x0,     y0);
  ctx.lineTo(x0 + h, y0);
  ctx.lineTo(x0,     y0 + h);
  ctx.closePath(); ctx.fill();
}

function bottomRightTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const h = ri(s * 0.70);
  const x0 = ri(cx) - ri(h / 2), y0 = ri(cy) - ri(h / 2);
  ctx.beginPath();
  ctx.moveTo(x0 + h, y0);
  ctx.lineTo(x0 + h, y0 + h);
  ctx.lineTo(x0,     y0 + h);
  ctx.closePath(); ctx.fill();
}

function verticalLines(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const h = ri(s * 0.70);
  const half = ri(h / 2);
  const icx = ri(cx), icy = ri(cy);
  const y0 = icy - half, y1 = icy + half;
  ctx.lineWidth = 1;
  const step = ri(h / 3);
  for (let i = 0; i < 4; i++) {
    const x = rs(icx - half + i * step);
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
  }
}

function horizontalLines(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const h = ri(s * 0.70);
  const half = ri(h / 2);
  const icx = ri(cx), icy = ri(cy);
  const x0 = icx - half, x1 = icx + half;
  ctx.lineWidth = 1;
  const step = ri(h / 3);
  for (let i = 0; i < 4; i++) {
    const y = rs(icy - half + i * step);
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  }
}

function wave(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const w = ri(s * 0.70);
  const x0 = ri(cx) - ri(w / 2);
  const amp = Math.max(2, ri(s * 0.14));
  ctx.lineWidth = Math.max(1, ri(s * 0.09));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ri((i / steps) * w);
    const y = ri(cy) + ri(Math.sin((i / steps) * 4 * Math.PI) * amp);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function fourDots(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const r = Math.max(1, ri(s * 0.11));
  const off = ri(s * 0.22);
  const icx = ri(cx), icy = ri(cy);
  for (const [dx, dy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as [number, number][]) {
    ctx.beginPath();
    ctx.arc(icx + dx * off, icy + dy * off, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function snowflake(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const r = ri(s * 0.36);
  const icx = ri(cx), icy = ri(cy);
  ctx.lineWidth = Math.max(1, ri(s * 0.11));
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    ctx.beginPath();
    ctx.moveTo(icx, icy);
    ctx.lineTo(icx + ri(Math.cos(a) * r), icy + ri(Math.sin(a) * r));
    ctx.stroke();
  }
}

function hourglass(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const hw = ri(s * 0.32), hh = ri(s * 0.34);
  const icx = ri(cx), icy = ri(cy);
  ctx.beginPath();
  ctx.moveTo(icx - hw, icy - hh);
  ctx.lineTo(icx + hw, icy - hh);
  ctx.lineTo(icx,      icy);
  ctx.lineTo(icx + hw, icy + hh);
  ctx.lineTo(icx - hw, icy + hh);
  ctx.lineTo(icx,      icy);
  ctx.closePath(); ctx.fill();
}

function diamondRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const r = ri(s * 0.36), ri2 = ri(r * 0.50);
  const icx = ri(cx), icy = ri(cy);
  ctx.beginPath();
  ctx.moveTo(icx,      icy - r);  ctx.lineTo(icx + r,  icy);
  ctx.lineTo(icx,      icy + r);  ctx.lineTo(icx - r,  icy); ctx.closePath();
  ctx.moveTo(icx,      icy - ri2); ctx.lineTo(icx + ri2, icy);
  ctx.lineTo(icx,      icy + ri2); ctx.lineTo(icx - ri2, icy); ctx.closePath();
  ctx.fill('evenodd');
}

function filledPlus(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const arm = ri(s * 0.34), thick = ri(s * 0.16);
  const icx = ri(cx), icy = ri(cy);
  ctx.beginPath();
  ctx.rect(icx - arm,   icy - thick, arm * 2,   thick * 2);
  ctx.rect(icx - thick, icy - arm,   thick * 2, arm * 2);
  ctx.fill();
}

// ── Registry ──────────────────────────────────────────────────────────────────

const E = (n: number) => String.fromCodePoint(0xe000 + n);

export const CUSTOM_SYMBOL_REGISTRY = new Map<string, SymbolDrawFn>([
  [E(1),  hatch],
  [E(2),  crossHatch],
  [E(3),  checkerboard],
  [E(4),  topHalf],
  [E(5),  bottomHalf],
  [E(6),  leftHalf],
  [E(7),  rightHalf],
  [E(8),  concentricSquares],
  [E(9),  topRightTriangle],
  [E(10), bottomLeftTriangle],
  [E(11), topLeftTriangle],
  [E(12), bottomRightTriangle],
  [E(13), verticalLines],
  [E(14), horizontalLines],
  [E(15), wave],
  [E(16), fourDots],
  [E(17), snowflake],
  [E(18), hourglass],
  [E(19), diamondRing],
  [E(20), filledPlus],
]);

export function isPUA(sym: string): boolean {
  const cp = sym.codePointAt(0) ?? 0;
  return cp >= 0xe000 && cp <= 0xf8ff;
}

// Draws a PUA custom symbol or a Unicode text character.
// Caller must pre-set ctx.font/textAlign/textBaseline for the Unicode path.
export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  sym: string,
  cx: number,
  cy: number,
  cellSize: number,
  color: string,
): void {
  const fn = CUSTOM_SYMBOL_REGISTRY.get(sym);
  if (fn) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    fn(ctx, cx, cy, cellSize);
    ctx.restore();
  } else {
    ctx.fillStyle = color;
    ctx.fillText(sym, cx, cy);
  }
}
