// Track 2 (Opportunity 9) step 2: turn a trend-detection imagePrompt into
// an actual candidate source image.
//
// The original plan (OPPORTUNITIES.md's "Image model choice" note) was to
// compare two models on AWS Bedrock before picking one. Checked against
// the live Bedrock catalog 2026-08-07
// (`aws bedrock list-foundation-models --by-output-modality IMAGE`) and
// that isn't viable as scoped: Titan Image Generator has reached
// end-of-life and no longer appears in the catalog; Stability AI's
// Bedrock offerings are now all specialized editing tools (upscale,
// inpaint, sketch/structure control, background removal, style transfer)
// that require a reference image, not plain text-to-image; and the one
// remaining option, Amazon Nova Canvas, is marked Legacy and returns
// AccessDenied on invoke ("not actively used in the last 30 days...
// upgrade to an active model") — confirmed both via direct InvokeModel
// calls and in the Bedrock console's Model catalog itself.
//
// Pivoted 2026-08-07 to calling providers directly instead of through
// Bedrock: Stability AI's own REST API (generateImageStability) is live;
// OpenAI is next. generateImageNovaCanvas is kept for reference/in case
// AWS re-activates the model, but is not expected to work right now.

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

export interface GeneratedImage {
  model: string;
  pngBase64: string;
}

// Added 2026-08-08 (Olga's ask): detectTrend()'s researched targetWidth/
// targetHeight can now actually reach the image itself, not just the
// post-generation conversion scale — both providers only accept one of a
// small discrete set of aspect ratios/sizes, so these pick the closest
// supported option rather than an arbitrary ratio. Pure/no-I/O, unit-
// tested in image-generation.test.ts.

// Stability's v2beta stable-image-core `aspect_ratio` param accepts
// exactly these nine values (platform.stability.ai/docs/api-reference).
const STABILITY_ASPECT_RATIOS: { ratio: string; value: number }[] = [
  { ratio: '21:9', value: 21 / 9 },
  { ratio: '16:9', value: 16 / 9 },
  { ratio: '3:2', value: 3 / 2 },
  { ratio: '5:4', value: 5 / 4 },
  { ratio: '1:1', value: 1 },
  { ratio: '4:5', value: 4 / 5 },
  { ratio: '2:3', value: 2 / 3 },
  { ratio: '9:16', value: 9 / 16 },
  { ratio: '9:21', value: 9 / 21 },
];

/** Nearest of Stability's 9 supported aspect ratios to width/height, by
 * log-scale distance (so e.g. 2:1 and 1:2 are equally "far" from 1:1 —
 * a plain linear diff would instead favor wide ratios). */
export function pickStabilityAspectRatio(width: number, height: number): string {
  const target = Math.log(width / height);
  let best = STABILITY_ASPECT_RATIOS[4]; // 1:1 fallback
  let bestDiff = Infinity;
  for (const opt of STABILITY_ASPECT_RATIOS) {
    const diff = Math.abs(Math.log(opt.value) - target);
    if (diff < bestDiff) { bestDiff = diff; best = opt; }
  }
  return best.ratio;
}

export type OpenAiImageSize = '1024x1024' | '1024x1536' | '1536x1024';

// gpt-image-1 only accepts these three concrete sizes (plus 'auto', not
// useful here since we want a specific researched ratio).
const OPENAI_SIZES: { size: OpenAiImageSize; ratio: number }[] = [
  { size: '1536x1024', ratio: 1536 / 1024 },
  { size: '1024x1024', ratio: 1 },
  { size: '1024x1536', ratio: 1024 / 1536 },
];

/** Nearest of OpenAI's 3 supported sizes to width/height, same log-scale
 * distance approach as pickStabilityAspectRatio. */
export function pickOpenAiSize(width: number, height: number): OpenAiImageSize {
  const target = Math.log(width / height);
  let best = OPENAI_SIZES[1]; // 1024x1024 fallback
  let bestDiff = Infinity;
  for (const opt of OPENAI_SIZES) {
    const diff = Math.abs(Math.log(opt.ratio) - target);
    if (diff < bestDiff) { bestDiff = diff; best = opt; }
  }
  return best.size;
}

interface NovaCanvasResponse {
  images?: string[];
  error?: string | null;
}

/** Currently broken — see the file header. Kept in case Bedrock access to
 * Nova Canvas gets re-activated later. */
export async function generateImageNovaCanvas(prompt: string): Promise<GeneratedImage> {
  const modelId = 'amazon.nova-canvas-v1:0';
  const body = JSON.stringify({
    taskType: 'TEXT_IMAGE',
    textToImageParams: { text: prompt.slice(0, 512) },
    imageGenerationConfig: {
      numberOfImages: 1,
      height: 1024,
      width: 1024,
      cfgScale: 8.0,
    },
  });

  const resp = await bedrock.send(new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: Buffer.from(body),
  }));

  const result = JSON.parse(Buffer.from(resp.body).toString()) as NovaCanvasResponse;
  if (result.error) throw new Error(`Nova Canvas error: ${result.error}`);
  if (!result.images?.[0]) throw new Error('Nova Canvas returned no image');

  return { model: modelId, pngBase64: result.images[0] };
}

// Stability AI's own API (api.stability.ai), not Bedrock — see file header
// for why. v2beta "Stable Image Core" endpoint: multipart/form-data in,
// raw image bytes out when Accept: image/* is set (simpler than asking
// for their JSON+base64 wrapper). Docs: platform.stability.ai/docs/api-reference.
export async function generateImageStability(prompt: string, aspectRatio: string = '1:1'): Promise<GeneratedImage> {
  const apiKey = process.env.STABILITY_API_KEY;
  if (!apiKey) throw new Error('STABILITY_API_KEY not set');

  const model = 'stable-image-core';
  const endpoint = 'core'; // the v2beta URL segment — distinct from the descriptive model label above
  const form = new FormData();
  form.set('prompt', prompt.slice(0, 10000));
  form.set('aspect_ratio', aspectRatio);
  form.set('output_format', 'png');

  const resp = await fetch(`https://api.stability.ai/v2beta/stable-image/generate/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'image/*',
    },
    body: form,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Stability API error ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  return { model, pngBase64: buffer.toString('base64') };
}

// Fights a different battle than prompting: both generateImageStability
// and generateImageOpenAI kept ignoring explicit "no vignette/no badge/
// no background" instructions in the prompt (2026-08-07, confirmed
// across two rounds of increasingly strict wording) — a common failure
// mode where negation instructions are weakly followed by diffusion-style
// image models, and repeating the excluded concept's name can even
// reinforce it. Stripping the background as a dedicated post-processing
// step is more reliable than continuing to fight the prompt. Returns a
// transparent PNG (RGBA) — pattern-converter.ts's own pipeline still has
// to decide what to do with transparent pixels; this function only
// removes the background, it doesn't flatten it back to a solid color.
export async function removeBackgroundStability(pngBase64: string): Promise<GeneratedImage> {
  const apiKey = process.env.STABILITY_API_KEY;
  if (!apiKey) throw new Error('STABILITY_API_KEY not set');

  const model = 'remove-background';
  const form = new FormData();
  form.set('image', new Blob([Buffer.from(pngBase64, 'base64')]), 'input.png');
  form.set('output_format', 'png');

  const resp = await fetch('https://api.stability.ai/v2beta/stable-image/edit/remove-background', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'image/*',
    },
    body: form,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Stability remove-background error ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  return { model, pngBase64: buffer.toString('base64') };
}

// OpenAI's Images API — gpt-image-1 returns base64 PNG data directly
// (b64_json), unlike the older DALL-E 3 API which needed an explicit
// response_format param to avoid getting a URL back instead.
export async function generateImageOpenAI(prompt: string, size: OpenAiImageSize = '1024x1024'): Promise<GeneratedImage> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const model = 'gpt-image-1';
  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt: prompt.slice(0, 32000),
      size,
      n: 1,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`OpenAI API error ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const result = (await resp.json()) as { data?: { b64_json?: string }[] };
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error(`OpenAI response had no b64_json: ${JSON.stringify(result).slice(0, 300)}`);

  return { model, pngBase64: b64 };
}
