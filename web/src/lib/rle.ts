// Run-length codec for number[][] grids. Used for pattern color grids
// (pattern-storage.ts) and for the boolean 0/1 stitch-progress grid
// (progress route) — same format, shared so client and server encode/
// decode identically.

export function rleEncode(grid: number[][]): string {
  const flat = grid.flat();
  if (flat.length === 0) return '';
  const parts: string[] = [];
  let cur = flat[0], count = 1;
  for (let i = 1; i < flat.length; i++) {
    if (flat[i] === cur) { count++; }
    else { parts.push(`${count}:${cur}`); cur = flat[i]; count = 1; }
  }
  parts.push(`${count}:${cur}`);
  return parts.join(',');
}

export function rleDecode(rle: string, width: number, height: number): number[][] {
  const flat: number[] = [];
  for (const part of rle.split(',')) {
    const colon = part.indexOf(':');
    const n = parseInt(part.slice(0, colon));
    const v = parseInt(part.slice(colon + 1));
    for (let i = 0; i < n; i++) flat.push(v);
  }
  return Array.from({ length: height }, (_, y) =>
    flat.slice(y * width, (y + 1) * width)
  );
}
