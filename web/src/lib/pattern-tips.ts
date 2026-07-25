import type { Design } from '@/app/types/design';

const AIDA_COUNT = 14;

function estimateInches(stitches: number): number {
  return Math.round((stitches / AIDA_COUNT) * 10) / 10;
}

// No per-design fact naturally distinguishes this tip, so rotate wording
// deterministically by DesignID instead of repeating one fixed sentence.
const THREAD_END_VARIANTS = [
  'Secure thread ends under nearby stitches instead of bulky knots.',
  'Weave thread tails under a few stitches on the back instead of tying knots — it keeps the front smooth.',
  'Skip the knots — anchor thread ends by running them under existing stitches on the reverse side.',
  'Tuck loose ends beneath nearby stitches on the back rather than knotting them; it keeps the fabric lying flat.',
  'Avoid knots at the back — weave each thread tail through a few stitches to hold it in place.',
];

function pickThreadEndTip(designId: number): string {
  const idx = ((designId % THREAD_END_VARIANTS.length) + THREAD_END_VARIANTS.length) % THREAD_END_VARIANTS.length;
  return THREAD_END_VARIANTS[idx];
}

// Varies with real per-design facts (stitch count, color count, size, skill
// level) so the text differs across designs instead of repeating verbatim.
export function getStitchPlanningTips(design: Design): string[] {
  const tips: string[] = [];

  if (design.Width && design.Height) {
    const w = estimateInches(design.Width);
    const h = estimateInches(design.Height);
    tips.push(
      `At ${design.Width} x ${design.Height} stitches, this works up to roughly ${w}" x ${h}" on standard 14-count Aida — check your own fabric's count before cutting.`
    );
  } else {
    tips.push('Measure your fabric against the stitch count to confirm finished size before cutting.');
  }

  const colors = design.NColors ?? 0;
  if (colors >= 25) {
    tips.push(
      `With ${colors} colors in the palette, sort floss into labeled bags by symbol before you start — worth the extra few minutes on a project this size.`
    );
  } else if (colors > 0) {
    tips.push(`With just ${colors} colors, you can thread a needle for each one up front and skip re-sorting mid-project.`);
  } else {
    tips.push('Sort floss by symbol before you start; pre-thread a few needles for speed.');
  }

  if (design.sizeCategory === 'large') {
    tips.push('Break the grid into quadrants and complete one section at a time — it keeps counting accurate on a design this large.');
  } else if (design.sizeCategory === 'small') {
    tips.push('This is small enough to finish in one or two sittings — start from the center square and work outward.');
  } else {
    tips.push('Work in small blocks to keep counting accurate and spot mistakes early.');
  }

  if (design.isBeginnerFriendly) {
    tips.push("This beginner-friendly design needs little backstitching — save it for outlines or small details at the end.");
  } else {
    tips.push('Backstitch at the end of each session so outlines and fine details stay crisp.');
  }

  return tips;
}

export function getFinishingTips(design: Design): string[] {
  const tips: string[] = [];
  const colors = design.NColors ?? 0;

  if (colors >= 25) {
    tips.push('With this many colors in rotation, cut floss into shorter 18-inch lengths — it avoids tangles as you switch skeins often.');
  } else {
    tips.push('Use shorter floss lengths to avoid tangles and keep coverage even.');
  }

  tips.push(pickThreadEndTip(design.DesignID));

  if (design.sizeCategory === 'large') {
    tips.push('For a piece this size, consider professional stretching and framing rather than a standard frame kit.');
  } else {
    tips.push('Gently wash and press face-down on a towel before framing.');
  }

  return tips;
}
