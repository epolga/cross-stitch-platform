// Piscina worker entry point for convertImage() - runs the CPU-bound
// color-quantization/DMC-matching pipeline on a separate worker thread so
// it doesn't block the main event loop (see
// docs/web/photo-converter-cpu-saturation-2026-09.md).
//
// Bundled separately from the Next.js app build via esbuild
// (scripts/build-workers.js) into web/workers/convert-worker.js, since
// Piscina needs a real, standalone, requireable JS file on disk - it
// can't run through Next's own route-bundling pipeline. Uses relative
// imports (not the `@/` alias) because this file is bundled outside
// Next's own module resolution.
import { convertImage, type ColorDistanceMode } from "../src/lib/pattern-converter";
import { type ConversionMode } from "../src/lib/image-analysis";

export interface ConvertWorkerInput {
  buffer: Buffer;
  width: number;
  height: number;
  colors: number;
  mode: ConversionMode;
  colorDistanceMode: ColorDistanceMode;
}

export default function run(input: ConvertWorkerInput) {
  return convertImage(
    input.buffer,
    input.width,
    input.height,
    input.colors,
    input.mode,
    input.colorDistanceMode,
  );
}
