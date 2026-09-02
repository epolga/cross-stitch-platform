// Generates a unique AI SEO description for a newly-published design page.
// Ported from uploader/Uploader/Helpers/SeoTextGenerator.cs (same prompt,
// same model, same skill-level heuristic) — vision-enabled when a cover
// image is available. Non-fatal: returns null on any failure so the publish
// pipeline never blocks on this step.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 400;

function determineSkillLevel(width: number, height: number, nColors: number): string {
  const isSmall = width > 0 && width < 80 && height > 0 && height < 80;
  const isLarge = width > 150 || height > 150;
  const manyColors = nColors > 30;

  if (isSmall && nColors < 10) return 'beginner';
  if (isLarge || manyColors) return 'advanced';
  return 'intermediate';
}

function buildPrompt(
  title: string, albumCaption: string, width: number, height: number, nColors: number,
  skillLevel: string, hasImage: boolean,
): string {
  const sizeStr = width > 0 && height > 0 ? `${width} × ${height} stitches` : 'compact';
  const colorStr = nColors > 0 ? `${nColors} DMC thread colors` : 'a curated thread palette';
  const visualInstruction = hasImage
    ? ' An image of the finished design is attached — look at it and ground the description in what\'s actually depicted (subject, pose, colors, composition, mood), not generic language.'
    : '';

  return `Write an SEO description for this free cross-stitch pattern page.

Design title: ${title}
Category: ${albumCaption}
Stitch count: ${sizeStr}
Colors: ${colorStr}
Skill level: ${skillLevel}

Instructions:
- Write exactly 2 paragraphs totalling 150–200 words
- Open with a sentence specific to this design (mention the title and what makes the subject interesting to stitch).${visualInstruction}
- Paragraph 1: describe the design and stitching experience (mention the stitch count and color count naturally)
- Paragraph 2: practical details — skill level, that it is a free printable PDF chart with DMC color keys, suitable for Aida fabric
- Use cross-stitch vocabulary naturally: counted cross stitch, Aida, DMC, needlework, embroidery
- Do NOT use these overused openers: "This pattern", "Beautiful", "Stunning", "This design"
- Output only the two paragraphs, no markdown, no headings`;
}

export interface GenerateSeoDescriptionInput {
  title: string;
  albumCaption: string;
  width: number;
  height: number;
  nColors: number;
  imageBase64?: string; // no data: prefix
  imageMediaType?: 'image/png' | 'image/jpeg' | 'image/webp';
}

export async function generateSeoDescription(input: GenerateSeoDescriptionInput): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const { title, albumCaption, width, height, nColors, imageBase64, imageMediaType } = input;
  const hasImage = Boolean(imageBase64 && imageMediaType);
  const skillLevel = determineSkillLevel(width, height, nColors);
  const prompt = buildPrompt(title, albumCaption, width, height, nColors, skillLevel, hasImage);

  try {
    const anthropic = new Anthropic({ apiKey });
    const content = hasImage
      ? [
          { type: 'image' as const, source: { type: 'base64' as const, media_type: imageMediaType!, data: imageBase64! } },
          { type: 'text' as const, text: prompt },
        ]
      : prompt;

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content }],
    });

    const block = msg.content[0];
    const text = block.type === 'text' ? block.text.trim() : '';
    return text || null;
  } catch (e) {
    // Non-fatal by design (publish must never block on this) - but the
    // failure itself must not vanish. Silently swallowing it here (as this
    // used to do) meant a real 3-of-10 failure during the 2026-09-02 batch
    // publish left no trace to diagnose from; retrying the same 3 designs
    // afterward succeeded with zero errors, suggesting a transient
    // API/network blip - but that's a guess made *after* the fact, not
    // something confirmed from a log, because there wasn't one. Logs land
    // wherever this call runs: CloudWatch
    // /aws/elasticbeanstalk/cross-stitch-com-env-clone/var/log/web.stdout.log
    // for the live publish-to-catalog route, or the invoking script's own
    // stdout/stderr for a one-off batch script.
    console.error('[design-seo-description] generation failed:', e instanceof Error ? e.message : e);
    return null;
  }
}
