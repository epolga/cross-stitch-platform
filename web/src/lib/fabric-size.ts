// Finished size of a counted cross-stitch pattern on a given fabric count.
// One "count" unit is stitches per inch, so size in inches = stitches / count,
// and 1 inch = 2.54 cm.

export interface FabricSize {
  cm: number;
  inches: number;
}

export function stitchesToSize(stitches: number, fabricCount: number): FabricSize {
  const inches = stitches / fabricCount;
  return { cm: inches * 2.54, inches };
}

export function formatFabricSize({ cm, inches }: FabricSize): string {
  return `${cm.toFixed(1)} cm (${inches.toFixed(1)}″)`;
}
