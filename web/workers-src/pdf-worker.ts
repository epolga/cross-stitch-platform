// Piscina worker entry point for buildPatternPdf() - see convert-worker.ts
// for why this is bundled separately rather than imported directly by the
// route handler.
import { buildPatternPdf, type BuildPatternPdfInput } from "../src/lib/pattern-pdf";

export default function run(input: BuildPatternPdfInput) {
  return buildPatternPdf(input);
}
