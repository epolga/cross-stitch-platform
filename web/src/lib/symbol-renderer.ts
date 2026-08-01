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

// ── StitchCraft library symbols (Olga's picks from sc_sym.dll) ────────────────
//
// Each entry is a 16-row list of horizontal "ink" runs ([startCol, len] pairs)
// reproducing the source 16x16 monochrome bitmap exactly — one fillRect per
// run (not per pixel) keeps draw calls low (4-34 per symbol here, comparable
// to the hand-authored shapes above). Generated once from the real bitmaps
// extracted out of sc_sym.dll; not meant to be hand-edited.
const STITCHCRAFT_BITMAPS: [number, number][][][] = [
  [[],[],[[2,12]],[[2,12]],[[2,12]],[[2,12]],[[2,12]],[[2,12]],[[2,12]],[[2,12]],[[2,12]],[[2,12]],[[2,12]],[[2,12]],[],[]], // #1 filled square
  [[],[],[[2,2],[12,2]],[[2,3],[11,3]],[[3,3],[10,3]],[[4,3],[9,3]],[[5,6]],[[6,4]],[[6,4]],[[5,6]],[[4,3],[9,3]],[[3,3],[10,3]],[[2,3],[11,3]],[[2,2],[12,2]],[],[]], // #2 X
  [[],[],[],[],[],[],[[2,12]],[[2,12]],[[2,12]],[[2,12]],[],[],[],[],[],[]], // #3 dash
  [[],[],[[6,4]],[[4,3],[9,3]],[[3,2],[11,2]],[[3,1],[12,1]],[[2,2],[12,2]],[[2,1],[13,1]],[[2,1],[13,1]],[[2,2],[12,2]],[[3,1],[12,1]],[[3,2],[11,2]],[[4,3],[9,3]],[[6,4]],[],[]], // #4 circle outline
  [[],[],[[7,2]],[[7,2]],[[6,4]],[[6,4]],[[5,6]],[[5,6]],[[4,8]],[[4,8]],[[3,10]],[[3,10]],[[2,12]],[[2,12]],[],[]], // #5 filled triangle
  [[],[],[[7,2]],[[7,2]],[[7,2]],[[7,2]],[[7,2]],[[2,12]],[[2,12]],[[7,2]],[[7,2]],[[7,2]],[[7,2]],[[7,2]],[],[]], // #6 plus
  [[],[],[[5,6]],[[5,6]],[[5,2],[9,2]],[[2,5],[9,5]],[[2,12]],[[2,2],[6,4],[12,2]],[[2,2],[6,4],[12,2]],[[2,12]],[[2,5],[9,5]],[[5,2],[9,2]],[[5,6]],[[5,6]],[],[]], // #143 flower cross
  [[],[],[],[],[],[[2,12]],[[2,12]],[],[],[[2,12]],[[2,12]],[],[],[],[],[]], // #8 equals
  [[],[],[[2,12]],[[2,12]],[[2,2],[7,2],[12,2]],[[2,2],[7,2],[12,2]],[[2,2],[7,2],[12,2]],[[2,12]],[[2,12]],[[2,2],[7,2],[12,2]],[[2,2],[7,2],[12,2]],[[2,2],[7,2],[12,2]],[[2,12]],[[2,12]],[],[]], // #102 window grid
  [[],[],[[2,12]],[[2,12]],[[2,2],[6,4],[12,2]],[[2,2],[7,2],[12,2]],[[2,3],[11,3]],[[2,4],[10,4]],[[2,4],[10,4]],[[2,3],[11,3]],[[2,2],[7,2],[12,2]],[[2,2],[6,4],[12,2]],[[2,12]],[[2,12]],[],[]], // #182 boxed X
  [[],[],[[2,4],[10,4]],[[2,1],[5,2],[9,2],[13,1]],[[2,1],[6,4],[13,1]],[[2,2],[7,2],[12,2]],[[3,2],[6,4],[11,2]],[[4,3],[9,3]],[[4,3],[9,3]],[[3,2],[6,4],[11,2]],[[2,2],[7,2],[12,2]],[[2,1],[6,4],[13,1]],[[2,1],[5,2],[9,2],[13,1]],[[2,4],[10,4]],[],[]], // #183 diamond cross
  [[],[],[[4,2],[10,2]],[[3,3],[10,3]],[[2,5],[9,5]],[[2,5],[9,5]],[[4,8]],[[6,4]],[[6,4]],[[4,8]],[[2,5],[9,5]],[[2,5],[9,5]],[[3,3],[10,3]],[[4,2],[10,2]],[],[]], // #257 clover X
  [[],[],[[7,2]],[[3,2],[7,2],[11,2]],[[3,3],[7,2],[10,3]],[[4,8]],[[5,6]],[[2,12]],[[2,12]],[[5,6]],[[4,8]],[[3,3],[7,2],[10,3]],[[3,2],[7,2],[11,2]],[[7,2]],[],[]], // #13 asterisk
  [[],[],[[7,2]],[[7,2]],[[6,4]],[[6,4]],[[2,12]],[[3,10]],[[4,8]],[[4,8]],[[4,8]],[[3,4],[9,4]],[[3,3],[10,3]],[[3,2],[11,2]],[],[]], // #87 star
  [[],[],[[6,4]],[[4,8]],[[3,2],[7,2],[11,2]],[[3,1],[7,2],[12,1]],[[2,2],[7,2],[12,2]],[[2,12]],[[2,12]],[[2,2],[7,2],[12,2]],[[3,1],[7,2],[12,1]],[[3,2],[7,2],[11,2]],[[4,8]],[[6,4]],[],[]], // #101 circled cross
  [[],[],[[7,2]],[[6,4]],[[5,6]],[[4,2],[7,2],[10,2]],[[3,2],[7,2],[11,2]],[[2,12]],[[2,12]],[[3,2],[7,2],[11,2]],[[4,2],[7,2],[10,2]],[[5,6]],[[6,4]],[[7,2]],[],[]], // #118 diamond plus
  [[],[],[[2,12]],[[2,12]],[[2,2],[12,2]],[[2,2],[5,2],[9,2],[12,2]],[[2,2],[5,6],[12,2]],[[2,2],[6,4],[12,2]],[[2,2],[6,4],[12,2]],[[2,2],[5,6],[12,2]],[[2,2],[5,2],[9,2],[12,2]],[[2,2],[12,2]],[[2,12]],[[2,12]],[],[]], // #291 bold boxed X
  [[],[],[[3,4],[9,4]],[[2,2],[6,4],[12,2]],[[2,1],[7,2],[13,1]],[[2,1],[7,2],[13,1]],[[2,1],[7,2],[13,1]],[[2,1],[13,1]],[[2,2],[12,2]],[[3,2],[11,2]],[[4,2],[10,2]],[[5,2],[9,2]],[[6,4]],[[7,2]],[],[]], // #343 heart
  [[],[],[[2,12]],[[2,12]],[[7,2]],[[7,2]],[[7,2]],[[7,2]],[[7,2]],[[7,2]],[[7,2]],[[7,2]],[[2,12]],[[2,12]],[],[]], // #19 I-beam
  [[],[],[[3,4],[9,4]],[[2,2],[6,4],[12,2]],[[2,1],[7,2],[13,1]],[[2,1],[7,2],[13,1]],[[2,2],[12,2]],[[3,3],[10,3]],[[3,3],[10,3]],[[2,2],[12,2]],[[2,1],[7,2],[13,1]],[[2,1],[7,2],[13,1]],[[2,2],[6,4],[12,2]],[[3,4],[9,4]],[],[]], // #344 four-leaf clover
  [[],[],[[7,2]],[[7,2]],[[6,4]],[[6,1],[9,1]],[[4,3],[9,3]],[[2,3],[11,3]],[[2,3],[11,3]],[[4,3],[9,3]],[[6,1],[9,1]],[[6,4]],[[7,2]],[[7,2]],[],[]], // #345 sparkle
  [[],[],[[7,2]],[[7,2]],[[3,10]],[[3,2],[6,1],[9,1],[11,2]],[[4,3],[9,3]],[[5,1],[10,1]],[[4,2],[10,2]],[[4,3],[9,3]],[[3,2],[6,1],[9,1],[11,2]],[[3,10]],[[7,2]],[[7,2]],[],[]], // #348 star hexagram
  [[],[],[[2,12]],[[2,12]],[[2,2],[6,1],[9,1],[12,2]],[[2,2],[6,1],[9,1],[12,2]],[[2,12]],[[2,2],[6,1],[9,1],[12,2]],[[2,2],[6,1],[9,1],[12,2]],[[2,12]],[[2,2],[6,1],[9,1],[12,2]],[[2,2],[6,1],[9,1],[12,2]],[[2,12]],[[2,12]],[],[]], // #490 fine grid
  [[],[],[[5,2],[9,2]],[[5,2],[9,2]],[[5,2],[9,2]],[[5,2],[9,2]],[[5,2],[9,2]],[[5,2],[9,2]],[[5,2],[9,2]],[[5,2],[9,2]],[[5,2],[9,2]],[[5,2],[9,2]],[[5,2],[9,2]],[[5,2],[9,2]],[],[]], // #24 double bar
  [[],[],[[2,12]],[[2,12]],[[2,2],[12,2]],[[2,2],[12,2]],[[2,2],[12,2]],[[2,2],[12,2]],[[2,2],[12,2]],[[2,2],[12,2]],[[2,2],[12,2]],[[2,2],[12,2]],[[2,12]],[[2,12]],[],[]], // #25 square outline
  [[],[],[[2,12]],[[2,12]],[[2,2],[12,2]],[[2,2],[5,6],[12,2]],[[2,2],[5,6],[12,2]],[[2,2],[5,2],[9,2],[12,2]],[[2,2],[5,2],[9,2],[12,2]],[[2,2],[5,6],[12,2]],[[2,2],[5,6],[12,2]],[[2,2],[12,2]],[[2,12]],[[2,12]],[],[]], // #177 nested square
  [[],[],[[6,4]],[[4,8]],[[3,10]],[[3,10]],[[2,12]],[[2,12]],[[2,12]],[[2,12]],[[3,10]],[[3,10]],[[4,8]],[[6,4]],[],[]], // #27 filled circle
  [[],[],[[6,4]],[[6,4]],[[6,4]],[[6,4]],[[6,4]],[[6,4]],[[6,4]],[[6,4]],[[6,4]],[[6,4]],[[6,4]],[[6,4]],[],[]], // #28 vertical bar
  [[],[],[[5,2],[9,2]],[[5,2],[9,2]],[[5,2],[9,2]],[[2,12]],[[2,12]],[[5,2],[9,2]],[[5,2],[9,2]],[[2,12]],[[2,12]],[[5,2],[9,2]],[[5,2],[9,2]],[[5,2],[9,2]],[],[]], // #491 hash
  [[],[],[[7,2]],[[6,4]],[[5,6]],[[4,8]],[[3,10]],[[2,12]],[[3,1],[12,1]],[[3,1],[12,1]],[[3,1],[12,1]],[[3,1],[12,1]],[[3,1],[12,1]],[[3,10]],[],[]], // #407 house outline
  [[],[],[[2,2],[12,2]],[[2,2],[12,2]],[[2,2],[12,2]],[[2,2],[12,2]],[[2,2],[12,2]],[[2,12]],[[2,12]],[[2,2],[12,2]],[[2,2],[12,2]],[[2,2],[12,2]],[[2,2],[12,2]],[[2,2],[12,2]],[],[]], // #21 H shape
  [[],[],[],[[12,2]],[[11,3]],[[10,3]],[[9,3]],[[8,3]],[[2,2],[7,3]],[[2,3],[6,3]],[[3,5]],[[4,3]],[[5,1]],[],[],[]], // #70 checkmark
  [[],[],[[5,6]],[[4,8]],[[3,3],[10,3]],[[2,5],[9,5]],[[2,2],[5,6],[12,2]],[[2,2],[6,4],[12,2]],[[2,2],[6,4],[12,2]],[[2,2],[5,6],[12,2]],[[2,5],[9,5]],[[3,3],[10,3]],[[4,8]],[[5,6]],[],[]], // #83 circled X
  [[],[],[[6,4]],[[5,2],[9,2]],[[5,1],[10,1]],[[5,1],[10,1]],[[5,2],[9,2]],[[6,4]],[[3,10]],[[2,2],[6,4],[12,2]],[[2,1],[7,2],[13,1]],[[2,1],[7,2],[13,1]],[[2,2],[6,4],[12,2]],[[3,4],[9,4]],[],[]], // #349 triple clover
  [[],[],[[2,12]],[[2,12]],[[3,2],[7,2],[11,2]],[[3,2],[7,2],[11,2]],[[3,2],[7,2],[11,2]],[[3,2],[7,2],[11,2]],[[3,2],[7,2],[11,2]],[[3,2],[7,2],[11,2]],[[3,2],[7,2],[11,2]],[[3,2],[7,2],[11,2]],[[2,12]],[[2,12]],[],[]], // #380 roman III
  [[],[],[],[],[],[[7,2]],[[6,4]],[[5,6]],[[5,6]],[[6,4]],[[7,2]],[],[],[],[],[]], // #43 dot
  [[],[],[[5,6]],[[4,8]],[[3,3],[10,3]],[[2,3],[11,3]],[[2,2],[7,2],[12,2]],[[2,2],[6,4],[12,2]],[[2,2],[6,4],[12,2]],[[2,2],[7,2],[12,2]],[[2,3],[11,3]],[[3,3],[10,3]],[[4,8]],[[5,6]],[],[]], // #56 circled dot
  [[],[],[[6,4]],[[4,8]],[[3,2],[7,2],[11,2]],[[3,1],[7,2],[12,1]],[[2,2],[7,2],[12,2]],[[2,1],[6,4],[13,1]],[[2,1],[5,6],[13,1]],[[2,5],[9,5]],[[3,3],[10,3]],[[3,2],[11,2]],[[4,3],[9,3]],[[6,4]],[],[]], // #364 circular swirl
  [[],[],[[7,2]],[[6,4]],[[5,2],[9,2]],[[4,2],[10,2]],[[3,2],[11,2]],[[2,12]],[[3,1],[12,1]],[[3,1],[12,1]],[[3,1],[12,1]],[[3,1],[12,1]],[[3,1],[12,1]],[[3,10]],[],[]], // #405 house
  [[],[],[[2,12]],[[2,12]],[[2,4],[10,4]],[[2,5],[9,5]],[[2,2],[5,6],[12,2]],[[2,2],[6,4],[12,2]],[[2,2],[6,4],[12,2]],[[2,2],[5,6],[12,2]],[[2,5],[9,5]],[[2,4],[10,4]],[[2,12]],[[2,12]],[],[]], // #82 cornered X box
];

const STITCHCRAFT_NAMES = [
  'Filled square', 'X', 'Dash', 'Circle outline', 'Filled triangle', 'Plus',
  'Flower cross', 'Equals', 'Window grid', 'Boxed X', 'Diamond cross', 'Clover X',
  'Asterisk', 'Star', 'Circled cross', 'Diamond plus', 'Bold boxed X', 'Heart',
  'I-beam', 'Four-leaf clover', 'Sparkle', 'Star hexagram', 'Fine grid', 'Double bar',
  'Square outline', 'Nested square', 'Filled circle', 'Vertical bar', 'Hash', 'House outline',
  'H shape', 'Checkmark', 'Circled X', 'Triple clover', 'Roman III', 'Dot',
  'Circled dot', 'Circular swirl', 'House', 'Cornered X box',
];

function drawStitchCraftSymbol(index: number): SymbolDrawFn {
  return (ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) => {
    const unit = s / 16;
    const x0 = ri(cx) - s / 2, y0 = ri(cy) - s / 2;
    const rows = STITCHCRAFT_BITMAPS[index];
    for (let row = 0; row < rows.length; row++) {
      for (const [start, len] of rows[row]) {
        // +0.75 keeps adjacent same-color runs from leaving a hairline seam
        // at fractional cell sizes — these are always fills, never strokes.
        ctx.fillRect(x0 + start * unit, y0 + row * unit, len * unit + 0.75, unit + 0.75);
      }
    }
  };
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const E = (n: number) => String.fromCodePoint(0xe000 + n);

export const CUSTOM_SYMBOL_REGISTRY = new Map<string, SymbolDrawFn>([
  [E(1),  hatch],
  [E(2),  crossHatch],
  [E(3),  checkerboard],
  [E(4),  topHalf],
  [E(5),  bottomHalf],
  [E(6),  leftHalf],
  [E(7),  rightHalf],
  [E(9),  topRightTriangle],
  [E(10), bottomLeftTriangle],
  [E(11), topLeftTriangle],
  [E(12), bottomRightTriangle],
  [E(13), verticalLines],
  [E(14), horizontalLines],
  [E(15), wave],
  [E(16), fourDots],
  [E(18), hourglass],
  [E(19), diamondRing],
]);

// StitchCraft library symbols (E21-E60) — registered in bulk since each is the
// same generic bitmap-run renderer, just indexed differently.
for (let i = 0; i < STITCHCRAFT_BITMAPS.length; i++) {
  CUSTOM_SYMBOL_REGISTRY.set(E(21 + i), drawStitchCraftSymbol(i));
}

export function isPUA(sym: string): boolean {
  const cp = sym.codePointAt(0) ?? 0;
  return cp >= 0xe000 && cp <= 0xf8ff;
}

export const CUSTOM_SYMBOL_NAMES = new Map<string, string>([
  [E(1),  'Hatch'],
  [E(2),  'Cross-hatch'],
  [E(3),  'Checkerboard'],
  [E(4),  'Top semicircle'],
  [E(5),  'Bottom semicircle'],
  [E(6),  'Left semicircle'],
  [E(7),  'Right semicircle'],
  [E(9),  'Top-right triangle'],
  [E(10), 'Bottom-left triangle'],
  [E(11), 'Top-left triangle'],
  [E(12), 'Bottom-right triangle'],
  [E(13), 'Vertical lines'],
  [E(14), 'Horizontal lines'],
  [E(15), 'Wave'],
  [E(16), 'Four dots'],
  [E(18), 'Hourglass'],
  [E(19), 'Diamond ring'],
]);

for (let i = 0; i < STITCHCRAFT_NAMES.length; i++) {
  CUSTOM_SYMBOL_NAMES.set(E(21 + i), STITCHCRAFT_NAMES[i]);
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
