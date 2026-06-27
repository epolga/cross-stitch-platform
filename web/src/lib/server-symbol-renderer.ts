import { createCanvas } from '@napi-rs/canvas';
import { drawSymbol } from './symbol-renderer';

// Server-side draw functions for Unicode geometric symbols.
// @napi-rs/canvas ships with only a basic monospace font — geometric shapes like ▲▼●☆⊕ etc.
// are not covered and render as □. We draw them explicitly with canvas primitives instead.
// This is intentionally separate from CUSTOM_SYMBOL_REGISTRY (which handles PUA symbols for
// both browser and server) so the browser keeps using its native fillText/system-font path.

type DrawFn = (ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) => void;

const ri = Math.round;
const rs = (n: number) => Math.round(n) + 0.5;

// ── Shared path helpers ────────────────────────────────────────────────────────

function trianglePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number, up: boolean) {
  const hy = h / 2, hw = h * 0.57; // ~equilateral proportions
  if (up) {
    ctx.moveTo(cx, cy - hy); ctx.lineTo(cx + hw, cy + hy); ctx.lineTo(cx - hw, cy + hy);
  } else {
    ctx.moveTo(cx, cy + hy); ctx.lineTo(cx + hw, cy - hy); ctx.lineTo(cx - hw, cy - hy);
  }
  ctx.closePath();
}

function rightTriPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number) {
  const hh = h / 2;
  ctx.moveTo(cx - hh, cy - hh); ctx.lineTo(cx + hh, cy); ctx.lineTo(cx - hh, cy + hh);
  ctx.closePath();
}

function diamondPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
  ctx.closePath();
}

function star5Path(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, r2: number) {
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r2;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function arrowLine(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number,
  dx: number, dy: number) {
  const len = ri(s * 0.60), head = ri(s * 0.24);
  const t = Math.max(1, ri(s * 0.09));
  ctx.lineWidth = t; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const x0 = cx - dx * len / 2, y0 = cy - dy * len / 2;
  const x1 = cx + dx * len / 2, y1 = cy + dy * len / 2;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  // Arrowhead
  const px = -dy, py = dx; // perpendicular
  ctx.beginPath();
  ctx.moveTo(x1 - (dx - px) * head, y1 - (dy - py) * head);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1 - (dx + px) * head, y1 - (dy + py) * head);
  ctx.stroke();
}

function diagArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number,
  sdx: number, sdy: number) {
  const inv = 1 / Math.sqrt(2);
  arrowLine(ctx, cx, cy, s, sdx * inv, sdy * inv);
}

// ── Registry ──────────────────────────────────────────────────────────────────

const UNICODE_DRAW = new Map<string, DrawFn>([
  // ── Solid shapes ──
  ['■', (ctx, cx, cy, s) => {
    const h = ri(s * 0.72), hh = ri(h / 2);
    ctx.fillRect(ri(cx) - hh, ri(cy) - hh, h, h);
  }],
  ['▲', (ctx, cx, cy, s) => {
    ctx.beginPath(); trianglePath(ctx, ri(cx), ri(cy), ri(s * 0.72), true); ctx.fill();
  }],
  ['▼', (ctx, cx, cy, s) => {
    ctx.beginPath(); trianglePath(ctx, ri(cx), ri(cy), ri(s * 0.72), false); ctx.fill();
  }],
  ['◆', (ctx, cx, cy, s) => {
    ctx.beginPath(); diamondPath(ctx, ri(cx), ri(cy), ri(s * 0.38)); ctx.fill();
  }],
  ['●', (ctx, cx, cy, s) => {
    ctx.beginPath(); ctx.arc(ri(cx), ri(cy), ri(s * 0.36), 0, Math.PI * 2); ctx.fill();
  }],
  ['★', (ctx, cx, cy, s) => {
    const r = ri(s * 0.38);
    ctx.beginPath(); star5Path(ctx, ri(cx), ri(cy), r, ri(r * 0.42)); ctx.fill();
  }],
  ['▪', (ctx, cx, cy, s) => {
    const h = ri(s * 0.45), hh = ri(h / 2);
    ctx.fillRect(ri(cx) - hh, ri(cy) - hh, h, h);
  }],
  ['▶', (ctx, cx, cy, s) => {
    ctx.beginPath(); rightTriPath(ctx, ri(cx), ri(cy), ri(s * 0.72)); ctx.fill();
  }],
  ['◀', (ctx, cx, cy, s) => {
    ctx.save(); ctx.translate(ri(cx), ri(cy)); ctx.scale(-1, 1);
    ctx.beginPath(); rightTriPath(ctx, 0, 0, ri(s * 0.72)); ctx.fill(); ctx.restore();
  }],

  // ── Outline shapes ──
  ['□', (ctx, cx, cy, s) => {
    const h = ri(s * 0.70), hh = ri(h / 2);
    ctx.lineWidth = 1; ctx.strokeRect(rs(ri(cx) - hh), rs(ri(cy) - hh), h - 1, h - 1);
  }],
  ['△', (ctx, cx, cy, s) => {
    ctx.lineWidth = 1;
    ctx.beginPath(); trianglePath(ctx, ri(cx), ri(cy), ri(s * 0.72), true); ctx.stroke();
  }],
  ['▽', (ctx, cx, cy, s) => {
    ctx.lineWidth = 1;
    ctx.beginPath(); trianglePath(ctx, ri(cx), ri(cy), ri(s * 0.72), false); ctx.stroke();
  }],
  ['◇', (ctx, cx, cy, s) => {
    ctx.lineWidth = 1;
    ctx.beginPath(); diamondPath(ctx, ri(cx), ri(cy), ri(s * 0.38)); ctx.stroke();
  }],
  ['○', (ctx, cx, cy, s) => {
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ri(cx), ri(cy), ri(s * 0.36), 0, Math.PI * 2); ctx.stroke();
  }],
  ['☆', (ctx, cx, cy, s) => {
    const r = ri(s * 0.38);
    ctx.lineWidth = 1;
    ctx.beginPath(); star5Path(ctx, ri(cx), ri(cy), r, ri(r * 0.42)); ctx.stroke();
  }],
  ['▫', (ctx, cx, cy, s) => {
    const h = ri(s * 0.45), hh = ri(h / 2);
    ctx.lineWidth = 1; ctx.strokeRect(rs(ri(cx) - hh), rs(ri(cy) - hh), h - 1, h - 1);
  }],

  // ── Circled / boxed ──
  ['⊕', (ctx, cx, cy, s) => {
    const r = ri(s * 0.36), icx = ri(cx), icy = ri(cy);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(icx, icy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx - r, icy); ctx.lineTo(icx + r, icy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx, icy - r); ctx.lineTo(icx, icy + r); ctx.stroke();
  }],
  ['⊗', (ctx, cx, cy, s) => {
    const r = ri(s * 0.36), d = ri(r * 0.707), icx = ri(cx), icy = ri(cy);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(icx, icy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx - d, icy - d); ctx.lineTo(icx + d, icy + d); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx + d, icy - d); ctx.lineTo(icx - d, icy + d); ctx.stroke();
  }],
  ['⊙', (ctx, cx, cy, s) => {
    const r = ri(s * 0.36), r2 = Math.max(2, ri(r * 0.3)), icx = ri(cx), icy = ri(cy);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(icx, icy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(icx, icy, r2, 0, Math.PI * 2); ctx.fill();
  }],
  ['⊞', (ctx, cx, cy, s) => {
    const h = ri(s * 0.70), hh = ri(h / 2), icx = ri(cx), icy = ri(cy);
    ctx.lineWidth = 1;
    ctx.strokeRect(rs(icx - hh), rs(icy - hh), h - 1, h - 1);
    ctx.beginPath(); ctx.moveTo(icx, icy - hh); ctx.lineTo(icx, icy + hh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx - hh, icy); ctx.lineTo(icx + hh, icy); ctx.stroke();
  }],
  ['⊠', (ctx, cx, cy, s) => {
    const h = ri(s * 0.70), hh = ri(h / 2), icx = ri(cx), icy = ri(cy);
    ctx.lineWidth = 1;
    ctx.strokeRect(rs(icx - hh), rs(icy - hh), h - 1, h - 1);
    ctx.beginPath(); ctx.moveTo(icx - hh, icy - hh); ctx.lineTo(icx + hh, icy + hh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx + hh, icy - hh); ctx.lineTo(icx - hh, icy + hh); ctx.stroke();
  }],
  ['⊡', (ctx, cx, cy, s) => {
    const h = ri(s * 0.70), hh = ri(h / 2), r2 = Math.max(2, ri(s * 0.11));
    ctx.lineWidth = 1;
    ctx.strokeRect(rs(ri(cx) - hh), rs(ri(cy) - hh), h - 1, h - 1);
    ctx.beginPath(); ctx.arc(ri(cx), ri(cy), r2, 0, Math.PI * 2); ctx.fill();
  }],

  // ── Plus / cross ──
  ['✚', (ctx, cx, cy, s) => {
    const arm = ri(s * 0.34), thick = ri(s * 0.14), icx = ri(cx), icy = ri(cy);
    ctx.beginPath();
    ctx.rect(icx - arm, icy - thick, arm * 2, thick * 2);
    ctx.rect(icx - thick, icy - arm, thick * 2, arm * 2);
    ctx.fill();
  }],
  ['✛', (ctx, cx, cy, s) => {
    const arm = ri(s * 0.34), icx = ri(cx), icy = ri(cy);
    ctx.lineWidth = Math.max(1, ri(s * 0.09));
    ctx.beginPath(); ctx.moveTo(icx - arm, icy); ctx.lineTo(icx + arm, icy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx, icy - arm); ctx.lineTo(icx, icy + arm); ctx.stroke();
  }],

  // ── Arrows ──
  ['↑', (ctx, cx, cy, s) => arrowLine(ctx, ri(cx), ri(cy), s, 0, -1)],
  ['↓', (ctx, cx, cy, s) => arrowLine(ctx, ri(cx), ri(cy), s, 0,  1)],
  ['←', (ctx, cx, cy, s) => arrowLine(ctx, ri(cx), ri(cy), s, -1, 0)],
  ['→', (ctx, cx, cy, s) => arrowLine(ctx, ri(cx), ri(cy), s,  1, 0)],
  ['↔', (ctx, cx, cy, s) => {
    arrowLine(ctx, ri(cx), ri(cy), s, -1, 0);
    arrowLine(ctx, ri(cx), ri(cy), s,  1, 0);
  }],
  ['↕', (ctx, cx, cy, s) => {
    arrowLine(ctx, ri(cx), ri(cy), s, 0, -1);
    arrowLine(ctx, ri(cx), ri(cy), s, 0,  1);
  }],
  ['↗', (ctx, cx, cy, s) => diagArrow(ctx, ri(cx), ri(cy), s,  1, -1)],
  ['↘', (ctx, cx, cy, s) => diagArrow(ctx, ri(cx), ri(cy), s,  1,  1)],
  ['↙', (ctx, cx, cy, s) => diagArrow(ctx, ri(cx), ri(cy), s, -1,  1)],
  ['↖', (ctx, cx, cy, s) => diagArrow(ctx, ri(cx), ri(cy), s, -1, -1)],

  // ── Math / set operators ──
  ['≠', (ctx, cx, cy, s) => {
    const w = ri(s * 0.58), gap = ri(s * 0.12), t = Math.max(1, ri(s * 0.09));
    ctx.lineWidth = t;
    const icx = ri(cx), icy = ri(cy);
    ctx.beginPath(); ctx.moveTo(icx - w/2, icy - gap); ctx.lineTo(icx + w/2, icy - gap); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx - w/2, icy + gap); ctx.lineTo(icx + w/2, icy + gap); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx + w*0.35, icy - gap*3); ctx.lineTo(icx - w*0.35, icy + gap*3); ctx.stroke();
  }],
  ['≡', (ctx, cx, cy, s) => {
    const w = ri(s * 0.58), gap = ri(s * 0.15), t = Math.max(1, ri(s * 0.09));
    ctx.lineWidth = t;
    const icx = ri(cx), icy = ri(cy);
    for (const dy of [-gap, 0, gap]) {
      ctx.beginPath(); ctx.moveTo(icx - w/2, icy + dy); ctx.lineTo(icx + w/2, icy + dy); ctx.stroke();
    }
  }],
  ['≈', (ctx, cx, cy, s) => {
    const w = ri(s * 0.58), gap = ri(s * 0.13), t = Math.max(1, ri(s * 0.09));
    ctx.lineWidth = t;
    const icx = ri(cx), icy = ri(cy);
    for (const dy of [-gap, gap]) {
      const x0 = icx - w/2, x1 = icx + w/2;
      ctx.beginPath();
      ctx.moveTo(x0, icy + dy);
      ctx.bezierCurveTo(x0 + w/4, icy + dy - gap, x0 + 3*w/4, icy + dy + gap, x1, icy + dy);
      ctx.stroke();
    }
  }],
  ['∅', (ctx, cx, cy, s) => {
    const r = ri(s * 0.34), d = ri(r * 0.85), icx = ri(cx), icy = ri(cy);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(icx, icy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx - d, icy + d); ctx.lineTo(icx + d, icy - d); ctx.stroke();
  }],
  ['∞', (ctx, cx, cy, s) => {
    const r = ri(s * 0.22), icx = ri(cx), icy = ri(cy);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(icx - r, icy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(icx + r, icy, r, 0, Math.PI * 2); ctx.stroke();
  }],
  ['∧', (ctx, cx, cy, s) => {
    const w = ri(s * 0.58), h = ri(s * 0.60), t = Math.max(1, ri(s * 0.09));
    ctx.lineWidth = t; ctx.lineJoin = 'round';
    const icx = ri(cx), icy = ri(cy);
    ctx.beginPath();
    ctx.moveTo(icx - w/2, icy + h/2); ctx.lineTo(icx, icy - h/2); ctx.lineTo(icx + w/2, icy + h/2);
    ctx.stroke();
  }],
  ['∨', (ctx, cx, cy, s) => {
    const w = ri(s * 0.58), h = ri(s * 0.60), t = Math.max(1, ri(s * 0.09));
    ctx.lineWidth = t; ctx.lineJoin = 'round';
    const icx = ri(cx), icy = ri(cy);
    ctx.beginPath();
    ctx.moveTo(icx - w/2, icy - h/2); ctx.lineTo(icx, icy + h/2); ctx.lineTo(icx + w/2, icy - h/2);
    ctx.stroke();
  }],
  ['∩', (ctx, cx, cy, s) => {
    const r = ri(s * 0.34), icx = ri(cx), icy = ri(cy), bot = icy + r * 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(icx - r, bot); ctx.lineTo(icx - r, icy);
    ctx.arc(icx, icy, r, Math.PI, 0, false);
    ctx.lineTo(icx + r, bot);
    ctx.stroke();
  }],
  ['∪', (ctx, cx, cy, s) => {
    const r = ri(s * 0.34), icx = ri(cx), icy = ri(cy), top = icy - r * 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(icx - r, top); ctx.lineTo(icx - r, icy);
    ctx.arc(icx, icy, r, Math.PI, 0, true);
    ctx.lineTo(icx + r, top);
    ctx.stroke();
  }],
  ['∇', (ctx, cx, cy, s) => {
    ctx.lineWidth = 1;
    ctx.beginPath(); trianglePath(ctx, ri(cx), ri(cy), ri(s * 0.72), false); ctx.stroke();
  }],
  ['∗', (ctx, cx, cy, s) => {
    const r = ri(s * 0.34), t = Math.max(1, ri(s * 0.10)), icx = ri(cx), icy = ri(cy);
    ctx.lineWidth = t; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath(); ctx.moveTo(icx, icy);
      ctx.lineTo(icx + Math.cos(a) * r, icy + Math.sin(a) * r); ctx.stroke();
    }
  }],
  ['±', (ctx, cx, cy, s) => {
    const w = ri(s * 0.55), gap = ri(s * 0.12), t = Math.max(1, ri(s * 0.09));
    ctx.lineWidth = t;
    const icx = ri(cx), icy = ri(cy), top = icy - gap;
    ctx.beginPath(); ctx.moveTo(icx - w/2, top - gap); ctx.lineTo(icx + w/2, top - gap); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx, top - gap - w/2 + ri(s*0.04)); ctx.lineTo(icx, top - gap + w/2 - ri(s*0.04)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx - w/2, icy + gap*2); ctx.lineTo(icx + w/2, icy + gap*2); ctx.stroke();
  }],

  // ── Lines ──
  ['‖', (ctx, cx, cy, s) => {
    const h = ri(s * 0.70), gap = ri(s * 0.14), icx = ri(cx), icy = ri(cy);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(rs(icx - gap), icy - h/2); ctx.lineTo(rs(icx - gap), icy + h/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rs(icx + gap), icy - h/2); ctx.lineTo(rs(icx + gap), icy + h/2); ctx.stroke();
  }],
  ['¬', (ctx, cx, cy, s) => {
    const w = ri(s * 0.58), h = ri(s * 0.32), t = Math.max(1, ri(s * 0.09));
    ctx.lineWidth = t; ctx.lineJoin = 'round';
    const icx = ri(cx), icy = ri(cy);
    ctx.beginPath();
    ctx.moveTo(icx - w/2, icy); ctx.lineTo(icx + w/2, icy); ctx.lineTo(icx + w/2, icy + h);
    ctx.stroke();
  }],
]);

// Render a symbol to a PNG buffer for embedding in PDFs.
// Strategy: PUA and listed Unicode symbols → explicit canvas drawing (font-independent).
// Other symbols (ASCII, Latin, Greek) → fall through to fillText with monospace.
// Draw at logical 16px with 4× canvas scale → 64px output embedded at ~12pt in the PDF.
export function renderSymbolToPng(symbol: string, color = '#000000'): Buffer {
  const SCALE = 4;
  const logical = 16;
  const canvas = createCanvas(logical * SCALE, logical * SCALE);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  const unicodeFn = UNICODE_DRAW.get(symbol);
  if (unicodeFn) {
    unicodeFn(ctx, logical / 2, logical / 2, logical);
  } else {
    ctx.font = `bold ${Math.max(logical - 4, 6)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawSymbol(ctx, symbol, logical / 2, logical / 2, logical, color);
  }

  return canvas.toBuffer('image/png');
}
