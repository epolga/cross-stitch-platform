/**
 * Visually confirm (or reject) the metadata-candidate duplicate groups from
 * find-duplicate-designs.ts — see docs/Focus.md Pending #13, Gap 3.
 *
 * The metadata pass groups by (Caption, AlbumID, Width, Height, NColors),
 * which is cheap but produces false positives: many groups are genuinely
 * *different* designs sharing a template. Confirmed by hand during this
 * pass: "99 Names of Allah" (8 designs) is a real series — same border/
 * font/layout, but each entry lists different Arabic names; a coarse
 * image hash alone can't tell that apart from a true duplicate.
 *
 * Two independent signals are computed per pair:
 *   1. SHA-256 of the raw downloaded bytes — a real duplicate is very often
 *      the *literal same file* re-used across DesignIDs (confirmed: the
 *      "Beauty of the Moon" group's designs 1421/1423/1424/1425/1426/1427
 *      are byte-identical files, not just similar-looking). Zero
 *      false-positive risk when this matches.
 *   2. dHash (9x8 grayscale, 64-bit difference hash) Hamming distance — a
 *      real signal, but templated/series content (repeating border, same
 *      font/colors, different text) can land at a similar distance to a
 *      true duplicate. Confirmed false positive: "99 Names of Allah"
 *      landed at distance 4-8, same range as true duplicates, despite
 *      being genuinely different designs.
 *
 * Because of that confirmed false-positive mode, dHash alone is NOT enough
 * to auto-apply a canonical tag — only byte-identical pairs are safe to
 * treat as certain. dHash-only matches are "worth a look," not "certain,"
 * regardless of how low the distance is.
 *
 * Output: reports/duplicate-designs-visual.json — every candidate pair with
 * both signals and a classification. Only "confirmed-duplicate" (byte-
 * identical) pairs should be fed into set-canonical-design.ts without a
 * manual look first; "worth-a-look" pairs need a human glance at the two
 * images before acting.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";

const REPORT_IN = path.join(process.cwd(), "reports", "duplicate-designs.json");
const REPORT_OUT = path.join(process.cwd(), "reports", "duplicate-designs-visual.json");

// dHash Hamming distance thresholds (out of 64 bits). Loose on purpose —
// see file header on why dHash alone never promotes a pair past
// "worth-a-look," no matter how low the distance.
const WORTH_A_LOOK_MAX = 16;

const CONCURRENCY = 5;

interface DuplicateGroup {
  caption: string;
  albumId: number;
  width: number;
  height: number;
  nColors: number;
  designs: { designId: number; designUrl: string; imageUrl: string }[];
}

interface DuplicateReport {
  generatedAt: string;
  groups: DuplicateGroup[];
}

interface ImageSignature {
  dHash: bigint;
  sha256: string;
}

async function computeSignature(imageUrl: string): Promise<ImageSignature | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) {
      console.warn(`  fetch failed (${res.status}): ${imageUrl}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const sha256 = crypto.createHash("sha256").update(buf).digest("hex");

    const { data } = await sharp(buf)
      .resize(9, 8, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let dHash = 0n;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const left = data[y * 9 + x];
        const right = data[y * 9 + x + 1];
        dHash = (dHash << 1n) | (left > right ? 1n : 0n);
      }
    }
    return { dHash, sha256 };
  } catch (err) {
    console.warn(`  signature failed for ${imageUrl}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

type Classification = "confirmed-duplicate" | "worth-a-look" | "probably-distinct" | "hash-failed";

function classify(byteIdentical: boolean, distance: number): Classification {
  if (byteIdentical) return "confirmed-duplicate";
  if (distance <= WORTH_A_LOOK_MAX) return "worth-a-look";
  return "probably-distinct";
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

(async () => {
  const report: DuplicateReport = JSON.parse(fs.readFileSync(REPORT_IN, "utf8"));
  console.log(`Loaded ${report.groups.length} candidate group(s) from ${REPORT_IN}`);

  const imageByDesign = new Map<number, string>();
  for (const g of report.groups) {
    for (const d of g.designs) imageByDesign.set(d.designId, d.imageUrl);
  }
  const designIds = Array.from(imageByDesign.keys());
  console.log(`Fetching + hashing ${designIds.length} unique image(s), concurrency ${CONCURRENCY}...`);

  let done = 0;
  const signatures = await mapWithConcurrency(designIds, CONCURRENCY, async (designId) => {
    const sig = await computeSignature(imageByDesign.get(designId)!);
    done++;
    if (done % 25 === 0 || done === designIds.length) {
      process.stdout.write(`  processed ${done}/${designIds.length}\r`);
    }
    return [designId, sig] as const;
  });
  process.stdout.write("\n");

  const sigByDesign = new Map<number, ImageSignature>();
  for (const [designId, sig] of signatures) {
    if (sig !== null) sigByDesign.set(designId, sig);
  }

  const outGroups = report.groups.map((g) => {
    const pairs: {
      a: number;
      b: number;
      byteIdentical: boolean;
      dHashDistance: number | null;
      classification: Classification;
    }[] = [];

    for (let i = 0; i < g.designs.length; i++) {
      for (let j = i + 1; j < g.designs.length; j++) {
        const a = g.designs[i].designId;
        const b = g.designs[j].designId;
        const sa = sigByDesign.get(a);
        const sb = sigByDesign.get(b);
        if (!sa || !sb) {
          pairs.push({ a, b, byteIdentical: false, dHashDistance: null, classification: "hash-failed" });
          continue;
        }
        const byteIdentical = sa.sha256 === sb.sha256;
        const dHashDistance = hammingDistance(sa.dHash, sb.dHash);
        pairs.push({ a, b, byteIdentical, dHashDistance, classification: classify(byteIdentical, dHashDistance) });
      }
    }

    const anyConfirmed = pairs.some((p) => p.classification === "confirmed-duplicate");
    const anyWorthLook = pairs.some((p) => p.classification === "worth-a-look");
    return { ...g, pairs, anyConfirmed, anyWorthLook };
  });

  const summary = {
    totalGroups: outGroups.length,
    groupsWithConfirmedDuplicate: outGroups.filter((g) => g.anyConfirmed).length,
    groupsWorthALook: outGroups.filter((g) => !g.anyConfirmed && g.anyWorthLook).length,
    totalPairs: outGroups.reduce((s, g) => s + g.pairs.length, 0),
    confirmedDuplicatePairs: outGroups.reduce((s, g) => s + g.pairs.filter((p) => p.classification === "confirmed-duplicate").length, 0),
    worthALookPairs: outGroups.reduce((s, g) => s + g.pairs.filter((p) => p.classification === "worth-a-look").length, 0),
    probablyDistinctPairs: outGroups.reduce((s, g) => s + g.pairs.filter((p) => p.classification === "probably-distinct").length, 0),
    hashFailedPairs: outGroups.reduce((s, g) => s + g.pairs.filter((p) => p.classification === "hash-failed").length, 0),
  };

  const out = {
    generatedAt: new Date().toISOString(),
    method:
      "SHA-256 byte-identity (zero false-positive, promotes to confirmed-duplicate) + dHash 9x8/64-bit Hamming distance " +
      `(<= ${WORTH_A_LOOK_MAX} bits = worth-a-look, NOT auto-applied — confirmed false positives on templated/series ` +
      'content like "99 Names of Allah" at distance 4-8).',
    sourceReport: REPORT_IN,
    summary,
    groups: outGroups,
  };
  fs.writeFileSync(REPORT_OUT, JSON.stringify(out, null, 2) + "\n");

  console.log(`\n═══ Visual verification summary ═══════════════════════════════`);
  console.log(`  Candidate groups:                 ${summary.totalGroups}`);
  console.log(`  Groups with a confirmed duplicate: ${summary.groupsWithConfirmedDuplicate}`);
  console.log(`  Groups worth a manual look:        ${summary.groupsWorthALook}`);
  console.log(`  Pairs checked:                     ${summary.totalPairs}`);
  console.log(`    confirmed-duplicate (byte-identical): ${summary.confirmedDuplicatePairs}`);
  console.log(`    worth-a-look:                    ${summary.worthALookPairs}`);
  console.log(`    probably-distinct:               ${summary.probablyDistinctPairs}`);
  console.log(`    hash-failed:                     ${summary.hashFailedPairs}`);
  console.log(`  Saved → ${REPORT_OUT}`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);

  console.log(`Confirmed-duplicate pairs (byte-identical — safe to feed into set-canonical-design.ts):\n`);
  for (const g of outGroups) {
    for (const p of g.pairs) {
      if (p.classification === "confirmed-duplicate") {
        console.log(`  ${g.caption} — design ${p.a} <-> design ${p.b}`);
      }
    }
  }

  console.log(`\nWorth-a-look pairs (dHash close, but NOT byte-identical — glance at both images first):\n`);
  for (const g of outGroups) {
    for (const p of g.pairs) {
      if (p.classification === "worth-a-look") {
        console.log(`  ${g.caption} — design ${p.a} <-> design ${p.b} (dHash distance ${p.dHashDistance})`);
      }
    }
  }
})();
