// Manual trigger for Track 2 (Opportunity 9) step 1 — runs detectTrend()
// against real AWS/Anthropic APIs. Real web_search billing per run, so
// only run when actually wanted; also currently the only trigger that
// exists (the real trigger mechanism — button vs. scheduled — is an
// explicitly deferred decision, see docs/genai-growth/OPPORTUNITIES.md
// Opportunity 9 "Build-order decision").
//
// Usage: npx tsx --env-file=.env.local scripts/run-trend-detection.ts
import { detectTrend } from '../src/lib/trend-detection';

async function main() {
  const result = await detectTrend();
  if (!result) {
    console.log('detectTrend() returned null — see stderr above for why.');
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
