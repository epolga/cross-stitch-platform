// Alerts Olga via Telegram when a daily-pipeline step fails, so a swallowed
// error doesn't sit invisible in CloudWatch until someone happens to go
// looking. Found the gap 2026-09-03: the 2026-08-26 AI-tools-scan +
// Competitor-scan monthly triggers both fired and both failed (Anthropic
// API "credit balance too low"), correctly logged via console.error in
// lambda/handler.ts's try/catch blocks — but nothing surfaced it anywhere
// Olga would actually see, so it went unnoticed for a week.
//
// Telegram, not email: it's already the channel for the daily suspicious-IP
// alert (see the review-ip skill), so it's the one Olga already has a habit
// of checking promptly — and aiToolsScan.ts already sends a Telegram
// message on *success* via the same client, so this is a direct extension
// of an already-working, already-credentialed path, not new infrastructure.
//
// Best-effort by design: a failure alert must never itself throw and take
// down the pipeline step that's already failing.

import { sendTelegramMessage } from "./telegramClient";

export async function alertPipelineStepFailure(step: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const text = `⚠️ <b>Daily pipeline step failed</b>\n\n<b>Step:</b> ${step}\n<b>Error:</b> ${message}`;
  try {
    await sendTelegramMessage(text);
  } catch (alertErr) {
    // If Telegram itself is down, at least this is still in the logs.
    console.error(`  [pipelineAlert] failed to send failure alert for "${step}":`, alertErr);
  }
}
