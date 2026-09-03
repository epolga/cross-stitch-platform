/**
 * One-shot checkpoint for 2026-09-06 — gathers real data for the cluster of
 * checks that all landed on this date (docs/Focus.md Open items #26/#27/#28,
 * #7, and the two IPs put on watch 2026-09-03) and emails a digest so Olga
 * doesn't have to remember to run each one by hand. Deliberately reports
 * raw data, not a verdict — the actual judgment calls (does the backfill
 * help, is Pinterest spend or the spam update driving position, block vs
 * extend the watched IPs) stay hers.
 *
 * Reuses the existing scripts as-is (run as subprocesses, output captured)
 * rather than re-implementing their logic:
 *   - _check_backfill_vs_control.ts (Open item #27)
 *   - _check_halo_effect.ts (Open item #7)
 * Adds directly in this script:
 *   - a light re-crawl signal for the caption-rename batch (Open item #28)
 *   - current status of the two IPs watched 2026-09-03 (see review-ip skill)
 *
 * GSC "Duplicate without user-selected canonical" Validate Fix status (Open
 * item #26) is NOT automated here — that's a GSC-UI-only status widget, not
 * worth bespoke API plumbing for 6 one-off URLs. Flagged in the email as a
 * manual check instead.
 *
 * Usage: npx tsx scripts/checkpoint-2026-09-06.ts
 * (invoked by the Windows Scheduled Task "Checkpoint20260906" — see
 * install-checkpoint-2026-09-06.ps1)
 */

import "dotenv/config";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { inspectUrl } from "../src/services/searchConsole";
import { queryRange } from "../src/services/historyStore";
import { sendEmail } from "../src/services/sesClient";

const SITE_URL = process.env.GSC_SITE_URL ?? "sc-domain:cross-stitch.com";
const WATCHED_IPS = ["2.29.24.92", "2.178.224.19"];
const CAPTION_RENAME_SAMPLE_SIZE = 20;

function runScript(relPath: string): string {
  try {
    return execSync(`npx tsx ${relPath}`, {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return `[FAILED to run ${relPath}]\n${err.stdout ?? ""}\n${err.stderr ?? err.message ?? String(e)}`;
  }
}

async function checkWatchedIps(): Promise<string> {
  const lines: string[] = [];
  const watched = await queryRange<{ ip: string; reason: string; watchedAt: string; ttl: number }>("WATCHED_IP");
  const history = await queryRange<{ ip: string; action: string; reason: string; at: string }>("IP_HISTORY");
  for (const ip of WATCHED_IPS) {
    const row = watched.find((w) => w.ip === ip);
    lines.push(`  ${ip}:`);
    if (row) {
      const ttlDate = new Date(row.ttl * 1000).toISOString();
      lines.push(`    Still on watch (expires ${ttlDate}) — reason: ${row.reason}`);
    } else {
      lines.push(`    No longer in WATCHED_IP (expired or already actioned)`);
    }
    const ipHistory = history.filter((h) => h.ip === ip).sort((a, b) => a.at.localeCompare(b.at));
    lines.push(`    History: ${ipHistory.length} entr${ipHistory.length === 1 ? "y" : "ies"}` +
      (ipHistory.length ? " — " + ipHistory.map((h) => `${h.action}@${h.at}`).join(", ") : ""));
  }
  return lines.join("\n");
}

// Mirrors CreateDesignUrl() in web/src/lib/url-helper.ts exactly:
// `/${Caption.replace(/\s+/g,'-')}-${AlbumID}-${NPage-1}-Free-Design.aspx`.
// caption-rename-batch.json doesn't store the resulting URL, only the
// pieces (newCaption, id="ALB#0017", nPage="00338") — reconstruct it the
// same way the site does rather than guessing a different format.
function buildDesignUrl(caption: string, albumIdStr: string, nPageStr: string): string {
  const formattedCaption = caption.replace(/\s+/g, "-");
  const albumId = parseInt(albumIdStr.replace(/^ALB#/, ""), 10);
  const nPage = parseInt(nPageStr, 10);
  return `/${formattedCaption}-${albumId}-${nPage - 1}-Free-Design.aspx`;
}

async function checkCaptionRenameBatch(): Promise<string> {
  const reportPath = path.join(__dirname, "..", "reports", "caption-rename-batch.json");
  if (!fs.existsSync(reportPath)) return "  caption-rename-batch.json not found — skipped.";
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
    renames: Array<{ designId: number; newCaption: string; id: string; nPage: string }>;
  };
  const urls = report.renames.map((r) => buildDesignUrl(r.newCaption, r.id, r.nPage));
  if (urls.length === 0) return "  No URLs found in caption-rename-batch.json — skipped.";

  const sample = urls.slice(0, CAPTION_RENAME_SAMPLE_SIZE);
  const breakdown: Record<string, number> = {};
  let checked = 0, failed = 0;
  for (const url of sample) {
    try {
      const result = await inspectUrl(SITE_URL, url);
      breakdown[result.coverageState] = (breakdown[result.coverageState] ?? 0) + 1;
      checked++;
    } catch {
      failed++;
    }
  }
  return [
    `  Batch size: ${urls.length} designs, sampled ${sample.length}`,
    `  Coverage state breakdown (n=${checked}, ${failed} failed): ${JSON.stringify(breakdown)}`,
    `  (Compare against the ~09-03 baseline noted in Focus.md Open item #28 — "crawled long ago, still not indexed" majority)`,
  ].join("\n");
}

async function main() {
  console.log("Running _check_backfill_vs_control.ts (Open item #27)...");
  const backfillOutput = runScript("scripts/_check_backfill_vs_control.ts");

  console.log("Running _check_halo_effect.ts (Open item #7)...");
  const haloOutput = runScript("scripts/_check_halo_effect.ts");

  console.log("Checking caption-rename batch re-crawl signal (Open item #28)...");
  const captionOutput = await checkCaptionRenameBatch();

  console.log("Checking watched IPs (2026-09-03 review-ip run)...");
  const ipOutput = await checkWatchedIps();

  const textBody = `
Checkpoint for 2026-09-06 — automated data digest, no decisions made for you.

=== Open item #27: Backfill A/B test (indexed % vs control) ===
${backfillOutput}

=== Open item #7: GSC position / Pinterest halo effect ===
${haloOutput}

=== Open item #28: Caption-rename batch re-crawl signal ===
${captionOutput}

=== Watched IPs from the 2026-09-03 review-ip run ===
${ipOutput}

=== NOT automated — check manually in GSC UI ===
Open item #26: "Duplicate without user-selected canonical" Validate Fix
status for the 6 URLs fixed 2026-08-23 (photo-to-cross-stitch?catalogPatternId=,
?page=59, a UTM/gclid URL, Free-India-Charts.aspx?pageSize=10&nPage=1,
/albums/9, a malformed ?eid_ link). Validate Fix status isn't cleanly
API-accessible for a one-off set like this — check the GSC Page Indexing
report directly.

Full context: docs/Focus.md Open items #7, #26, #27, #28; review-ip skill
for the IP watch entries.
`.trim();

  console.log("\n" + textBody + "\n");
  console.log("Sending email...");
  const result = await sendEmail({
    subject: "Cross-stitch.com — 2026-09-06 checkpoint digest",
    textBody,
  });
  console.log(`Sent. MessageId: ${result.messageId}`);
}

main().catch((err) => {
  console.error("[checkpoint-2026-09-06] fatal error:", err);
  process.exit(1);
});
