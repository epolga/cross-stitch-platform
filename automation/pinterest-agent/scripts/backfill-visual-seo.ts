/**
 * Backfill SeoTitle + SeoDescription using vision — looks at the actual design
 * image instead of generating from Caption/size/color counts alone.
 *
 * Replaces the old text-only backfill-seo-description.ts approach, which fed
 * the same generic Caption into every prompt (e.g. "Cushion Cover" x160) and
 * produced a fixed 2-paragraph structure for all 5270 designs — both create a
 * templated-content fingerprint that risks Google's "scaled content abuse"
 * policy (mass-generated pages with little distinguishing content).
 *
 * This script:
 *   - Sends the design's actual photo to Claude (vision) alongside its
 *     Caption/Album/size/color metadata.
 *   - Asks for a short, visually-grounded title (theme + color mood) that's
 *     unique even among designs sharing the same generic Caption.
 *   - Asks for SEO body text with randomized structure: 1-3 paragraphs of
 *     varying length, each covering a different angle chosen from a pool
 *     (visual subject, color story, stitching experience, materials, gift
 *     ideas, occasion, motif meaning) — the model picks what's relevant to
 *     THIS image rather than following a fixed formula every time.
 *
 * Tracking: every design this script successfully writes gets SeoTitle plus a
 * SeoTitleUpdatedAt timestamp. Designs without SeoTitle have NOT been touched
 * by this script yet (the old text-only backfill never set SeoTitle, so its
 * presence is an unambiguous "done with the vision method" marker). By
 * default, already-done designs are skipped — pass --force to redo them.
 *
 * Usage:
 *   npx tsx scripts/backfill-visual-seo.ts --report                    # coverage only, no generation
 *   npx tsx scripts/backfill-visual-seo.ts --designIds 2088,2095,2099   # targeted test
 *   npx tsx scripts/backfill-visual-seo.ts --limit 20                  # next 20 not-yet-done
 *   npx tsx scripts/backfill-visual-seo.ts --all                       # every not-yet-done design
 *   npx tsx scripts/backfill-visual-seo.ts --limit 20 --dry-run        # preview only, no writes
 *   npx tsx scripts/backfill-visual-seo.ts --designIds 2088 --force    # redo an already-done design
 *   npx tsx scripts/backfill-visual-seo.ts --album 104 --limit 20      # scope to one album
 */

import dotenv from "dotenv";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

dotenv.config({ path: path.join(process.cwd(), ".env") });

// ── Config ────────────────────────────────────────────────────────────────────

const ITEMS_TABLE = process.env.ITEMS_TABLE_NAME ?? "CrossStitchItems";
const REGION = process.env.AWS_REGION ?? "us-east-1";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const CLOUDFRONT_BASE = "https://d2o1uvvg91z7o4.cloudfront.net";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const all = args.includes("--all");
const force = args.includes("--force");
const reportOnly = args.includes("--report");
const designIdsArg = args.find((a) => a.startsWith("--designIds="))?.split("=")[1];
const explicitDesignIds = designIdsArg ? designIdsArg.split(",").map((s) => parseInt(s.trim(), 10)) : null;
const albumArg = args.find((a) => a.startsWith("--album="))?.split("=")[1];
const albumFilter = albumArg ? parseInt(albumArg, 10) : null;
function flagValue(name: string, fallback: string): string {
  const eqForm = args.find((a) => a.startsWith(`${name}=`));
  if (eqForm) return eqForm.split("=")[1];
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith("--")) return args[idx + 1];
  return fallback;
}

const limit = all ? Infinity : parseInt(flagValue("--limit", "20"), 10);
const concurrency = parseInt(flagValue("--concurrency", "3"), 10);

// ── DynamoDB ──────────────────────────────────────────────────────────────────

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

interface DesignRow {
  id: string;
  nPage: string;
  designId: number;
  albumId: number;
  caption: string;
  width: number;
  height: number;
  nColors: number;
  hasVisualSeo: boolean;
  seoTitleUpdatedAt?: string;
  previousSeoDescription?: string;
}

/** Scans every DESIGN item. Used by --report and as the base for --all / --limit filtering. */
async function fetchAllDesigns(): Promise<DesignRow[]> {
  const results: DesignRow[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const resp = await ddb.send(
      new QueryCommand({
        TableName: ITEMS_TABLE,
        IndexName: "DesignsByID-index",
        KeyConditionExpression: "EntityType = :et",
        ExpressionAttributeValues: { ":et": "DESIGN" },
        ScanIndexForward: false, // DESC by DesignID — newest first
        ExclusiveStartKey: exclusiveStartKey as never,
      }),
    );

    for (const item of resp.Items ?? []) {
      results.push({
        id: item["ID"] as string,
        nPage: item["NPage"] as string,
        designId: item["DesignID"] as number,
        albumId: item["AlbumID"] as number,
        caption: (item["Caption"] as string) ?? "",
        width: (item["Width"] as number) ?? 0,
        height: (item["Height"] as number) ?? 0,
        nColors: (item["NColors"] as number) ?? 0,
        hasVisualSeo: !!item["SeoTitle"],
        seoTitleUpdatedAt: item["SeoTitleUpdatedAt"] as string | undefined,
        previousSeoDescription: item["SeoDescription"] as string | undefined,
      });
    }

    exclusiveStartKey = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return results;
}

async function fetchDesigns(): Promise<DesignRow[]> {
  const all_ = await fetchAllDesigns();

  if (explicitDesignIds) {
    // Preserve the order requested on the CLI; explicit IDs are processed
    // regardless of hasVisualSeo (an explicit ask is treated like --force).
    return explicitDesignIds
      .map((id) => all_.find((r) => r.designId === id))
      .filter((r): r is DesignRow => !!r);
  }

  let candidates = force ? all_ : all_.filter((r) => !r.hasVisualSeo);
  if (albumFilter !== null) candidates = candidates.filter((r) => r.albumId === albumFilter);
  return limit === Infinity ? candidates : candidates.slice(0, limit);
}

async function getAlbumCaption(albumId: number): Promise<string> {
  try {
    const resp = await ddb.send(
      new QueryCommand({
        TableName: ITEMS_TABLE,
        KeyConditionExpression: "ID = :pk",
        FilterExpression: "EntityType = :albumType",
        ExpressionAttributeValues: {
          ":pk": `ALB#${String(albumId).padStart(4, "0")}`,
          ":albumType": "ALBUM",
        },
        ProjectionExpression: "Caption",
        Limit: 1,
      }),
    );
    return (resp.Items?.[0]?.["Caption"] as string) ?? "";
  } catch {
    return "";
  }
}

async function writeVisualSeo(
  design: DesignRow,
  title: string,
  description: string,
  subjectBlurb: string,
): Promise<void> {
  // Only back up the pre-vision text the first time — a --force rerun must not
  // clobber the original backup with the previous vision-generated text.
  const backupExpr = design.hasVisualSeo ? "" : ", SeoDescriptionPrevious = :prev";
  await ddb.send(
    new UpdateCommand({
      TableName: ITEMS_TABLE,
      Key: { ID: design.id, NPage: design.nPage },
      UpdateExpression: `SET SeoTitle = :t, SeoDescription = :d, SeoTitleUpdatedAt = :u, SeoSubjectBlurb = :b, LastModifiedAt = :u${backupExpr}`,
      ExpressionAttributeValues: {
        ":t": title,
        ":d": description,
        ":u": new Date().toISOString(),
        ":b": subjectBlurb,
        ...(design.hasVisualSeo ? {} : { ":prev": design.previousSeoDescription ?? "" }),
      },
    }),
  );
}

// ── Image fetch ───────────────────────────────────────────────────────────────

async function fetchImageBase64(albumId: number, designId: number): Promise<{ base64: string; mediaType: "image/jpeg" } | null> {
  const url = `${CLOUDFRONT_BASE}/photos/${albumId}/${designId}/4.jpg`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    return { base64: buf.toString("base64"), mediaType: "image/jpeg" };
  } catch {
    return null;
  }
}

// ── Claude (vision + structured output) ──────────────────────────────────────

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    visibleText: {
      type: "string",
      description:
        "Any readable text/lettering/calligraphy visible in the image, transcribed as accurately as possible in its " +
        "original script. If it is not in English/Latin script, follow it with a transliteration and a short English " +
        "translation in parentheses, e.g. 'الرحمن (Ar-Rahman — The Most Merciful)'. Empty string if no readable text is visible.",
    },
    title: {
      type: "string",
      description: "Short unique page title grounded in what's visible in the image, 4-9 words",
    },
    paragraphs: {
      type: "array",
      items: { type: "string" },
      description: "1 to 3 SEO paragraphs, varying length and thematic angle",
    },
    subjectCategory: {
      type: "string",
      enum: ["animal", "building-landmark", "plant", "text-quote", "geometric-ornamental", "object", "other"],
      description: "What kind of subject this design actually depicts",
    },
    subjectBlurb: {
      type: "string",
      description:
        "A short mini-story/fact blurb about the SUBJECT itself (not the cross-stitch craft, not the pattern's specs) — " +
        "empty string only if truly nothing concrete applies.",
    },
  },
  required: ["visibleText", "title", "paragraphs", "subjectCategory", "subjectBlurb"],
  additionalProperties: false,
};

/**
 * Left to its own judgment, the model almost never picks 1 paragraph (observed
 * 0/1990 in the first production batch — it settles into a 2-vs-3 habit despite
 * being told "sometimes 1"). Assigning the paragraph count in code and stating
 * it as a hard requirement is the reliable way to get real structural variety.
 */
function pickParagraphTarget(): 1 | 2 | 3 {
  const r = Math.random();
  if (r < 0.3) return 1;
  if (r < 0.7) return 2;
  return 3;
}

function bodyInstructions(target: 1 | 2 | 3): string {
  switch (target) {
    case 1:
      return "Write EXACTLY 1 paragraph, 80-140 words. Cover only 1-2 angles — keep it tight and specific, not a summary of everything.";
    case 2:
      return "Write EXACTLY 2 paragraphs, 130-190 words total. Make the two paragraphs noticeably different lengths (e.g. one ~50-70 words, the other ~90-130 words) — do not split evenly. Cover 2 different angles, one per paragraph.";
    case 3:
      return "Write EXACTLY 3 paragraphs, 170-230 words total. Vary the three paragraph lengths clearly (short/medium/long, in any order) — do not make them roughly equal. Cover up to 3 different angles.";
  }
}

/**
 * The subject blurb needs its own independent length AND style variety —
 * same "the model won't reliably self-vary, enforce it in code" lesson as
 * pickParagraphTarget above, applied twice (once for length, once for
 * register) so blurbs don't converge into a single recognizable shape
 * across thousands of designs.
 */
function pickBlurbLength(): "short" | "medium" {
  return Math.random() < 0.5 ? "short" : "medium";
}

const BLURB_STYLES = [
  "factual and encyclopedic — like a well-written reference entry",
  "warm and narrative — tell it like a small story",
  "curious and conversational — as if pointing something out to a friend",
  "quietly reflective — a calmer, more contemplative register",
] as const;

function pickBlurbStyle(): string {
  return BLURB_STYLES[Math.floor(Math.random() * BLURB_STYLES.length)];
}

function blurbInstructions(length: "short" | "medium", style: string): string {
  const lengthSpec =
    length === "short"
      ? "1 paragraph, 40-70 words"
      : "1-2 short paragraphs, 90-140 words total";
  return `Write ${lengthSpec}. Tone/register: ${style}.`;
}

function skillLevel(width: number, height: number, nColors: number): string {
  const small = width > 0 && width < 80 && height > 0 && height < 80;
  const large = width > 150 || height > 150;
  if (small && nColors < 10) return "beginner";
  if (large || nColors > 30) return "advanced";
  return "intermediate";
}

async function generateVisualSeo(
  design: DesignRow,
  albumCaption: string,
  imageBase64: string,
  mediaType: "image/jpeg",
): Promise<{ title: string; description: string; targetParagraphs: number; subjectCategory: string; subjectBlurb: string } | null> {
  const size = design.width > 0 && design.height > 0 ? `${design.width} x ${design.height} stitches` : "compact";
  const colors = design.nColors > 0 ? `${design.nColors} DMC thread colors` : "a curated thread palette";
  const level = skillLevel(design.width, design.height, design.nColors);
  const targetParagraphs = pickParagraphTarget();
  const blurbLength = pickBlurbLength();
  const blurbStyle = pickBlurbStyle();

  const prompt = `Look at this cross-stitch pattern image, then write page copy for it.

Design name (on file): ${design.caption}
Category/album: ${albumCaption || "Cross Stitch"}
Stitch count: ${size}
Colors: ${colors}
Skill level: ${level}

This design shares its generic file name with many other designs in the catalog (there may be over a hundred designs all named "${design.caption}"), so the title and text MUST be distinguishable from those other designs based on what is actually visible in THIS image — specific subject details, composition, and color mood (e.g. "soft pastel", "bold bright", "warm rustic", "cool muted", "jewel-toned").

VISIBLE TEXT — read this first: look carefully for any readable text, lettering, or calligraphy stitched into the image (words, names, quotes, a monogram, religious/decorative script, etc.). Some designs in this catalog are a shared visual template (same border, same font, same layout) reused many times with DIFFERENT text each time — for those, the text is the ONLY real differentiator, and color/composition instructions above will not help. Transcribe it into the visibleText field exactly as it appears; if it isn't English/Latin script, add a transliteration and short translation in parentheses. Leave it as an empty string only if there is truly no readable text.

TITLE (4-9 words):
- If visibleText is non-empty, the title MUST reference the specific text/name/quote itself (not just "calligraphy" or "quote design" generically) — that is what makes this page different from the others sharing the same template.
- Otherwise, ground it in what you see: the specific subject/motif and a color-mood descriptor.
- May include the design name naturally, but do not rely on the design name alone to differentiate it.
- Do NOT include the word "Design" or any ID number.
- Do NOT use these overused openers/fillers: "Beautiful", "Stunning", "Lovely", "Charming".

BODY:
- ${bodyInstructions(targetParagraphs)}
- If visibleText is non-empty, one paragraph MUST state plainly what text/name/quote is stitched (quote it, with transliteration/translation if applicable) — do not just describe the calligraphy style without saying what it actually spells out.
- Pick remaining angles that are actually relevant to THIS image from this pool: visual subject & composition, color palette & mood, stitching experience & difficulty, materials & practical info (Aida fabric, DMC threads, free printable PDF chart), gift/home-decor use ideas, seasonal/occasion relevance, motif meaning or story.
- Ground concrete details (colors, subject specifics) in what you actually observe in the image, not generic phrases.
- Vary your opening sentence structure — do not start every design the same way.
- Do NOT use these overused openers: "This pattern", "Beautiful", "Stunning", "This design".
- Use cross-stitch vocabulary naturally where relevant: counted cross stitch, Aida, DMC, needlework, embroidery.

SUBJECT CLASSIFICATION + BLURB — this is separate from the BODY above and serves a different purpose: the BODY is about the pattern/craft, the blurb is about the actual real-world SUBJECT depicted.
- First decide subjectCategory — what does this image actually depict:
  - "animal" — a real or stylized creature
  - "building-landmark" — architecture, a real or generic place
  - "plant" — flowers, trees, produce, etc.
  - "text-quote" — the image IS text/calligraphy/lettering (use visibleText as the basis)
  - "geometric-ornamental" — an abstract, geometric, or repeating decorative pattern with no concrete depicted subject (diamonds, chevrons, mandalas, borders, quilting-style blocks, etc.)
  - "object" — a concrete inanimate thing (a car, a cup, a building interior detail, etc.) that isn't architecture
  - "other" — genuinely none of the above fits
- Then write subjectBlurb — a short piece about that SUBJECT itself, not about cross-stitching it:
  - animal/plant/object: a real, general, well-known fact or bit of natural/cultural interest about that specific species/thing. Don't invent specific statistics or dates you aren't confident about — prefer well-known general facts over specific ones you're unsure of.
  - building-landmark: if you can identify the specific real place (helped by the design name/album above), a couple of genuinely interesting, well-known facts about it. If you cannot confidently identify the specific place, write generally about that *type* of architecture instead of guessing a specific identity.
  - text-quote: briefly, what the text means or where this kind of saying/name comes from (culturally/historically), not a repeat of the BODY's mention of it.
  - geometric-ornamental: this is NOT a "no story" case — every geometric/ornamental style has a real history. Identify the specific style of pattern visible (e.g. concentric diamond/lozenge, chevron/zigzag, mandala/radial symmetry, quilt-block, paisley, Celtic knotwork, Op-art) and write about THAT style's real tradition, symmetry, or cultural origin — grounded in the specific visual structure you actually see (how many layers, what kind of symmetry), not a generic statement that could describe any pattern.
  - other: ground it in the most specific real visual detail you can point to in this exact image (not a generic sentence that could apply to any design).
  - Leave subjectBlurb as an empty string only if you genuinely cannot say anything specific to this image.
  - ${blurbInstructions(blurbLength, blurbStyle)}
  - Do NOT mention stitching, DMC, Aida, or the craft itself in the blurb — that belongs in BODY, not here.

Output only the structured result — no markdown, no headings.`;

  try {
    // Non-streaming call (no `stream: true`), but the params cast below (needed
    // because output_config/json_schema isn't in this SDK version's stricter
    // MessageCreateParams type) makes TS widen create()'s return type to
    // include the Stream<...> overload too — cast the result back down to the
    // real (non-stream) Message shape so `.content` resolves.
    const msg = (await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
      output_config: { format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
    } as Anthropic.MessageCreateParams)) as Anthropic.Message;

    const block = msg.content[0];
    if (block.type !== "text") return null;
    const parsed = JSON.parse(block.text) as {
      visibleText: string;
      title: string;
      paragraphs: string[];
      subjectCategory: string;
      subjectBlurb: string;
    };
    let paragraphs = parsed.paragraphs.slice(0, 3);
    if (paragraphs.length !== targetParagraphs) {
      console.warn(`    DesignID=${design.designId}: asked for ${targetParagraphs} paragraph(s), got ${paragraphs.length} — merging to match`);
    }
    if (paragraphs.length > targetParagraphs) {
      // The model doesn't reliably honor "exactly N" (observed even for N=1) —
      // fold the overflow into the last kept paragraph as flowing prose rather
      // than leaving the requested structure unenforced.
      const head = paragraphs.slice(0, targetParagraphs - 1);
      const tail = paragraphs.slice(targetParagraphs - 1).join(" ");
      paragraphs = targetParagraphs > 0 ? [...head, tail] : paragraphs;
    }

    let description = paragraphs.join("\n\n").trim();
    const visibleText = parsed.visibleText.trim();
    if (visibleText) {
      // Belt-and-suspenders: the prompt asks the model to weave the actual
      // text into a paragraph, but that instruction isn't always followed
      // reliably (same lesson as the paragraph-count enforcement above) —
      // if the transcribed text doesn't already appear verbatim, append a
      // plain sentence stating it. This is the field that actually
      // differentiates same-template/different-text designs (e.g. the "99
      // Names of Allah" series), so it must land in the output every time.
      const firstToken = visibleText.split(/[\s(,]/)[0];
      if (firstToken && !description.includes(firstToken)) {
        description += `\n\nThe stitched lettering reads: ${visibleText}.`;
      }
    }

    return {
      title: parsed.title.trim(),
      description,
      targetParagraphs,
      subjectCategory: parsed.subjectCategory,
      subjectBlurb: parsed.subjectBlurb.trim(),
    };
  } catch (err) {
    console.warn(`    generation failed for DesignID=${design.designId}: ${(err as Error).message}`);
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function printReport(): Promise<void> {
  console.log("\nScanning designs for visual-SEO coverage...");
  const all_ = await fetchAllDesigns();
  const done = all_.filter((r) => r.hasVisualSeo);
  const notDone = all_.filter((r) => !r.hasVisualSeo);

  console.log(`\n== Visual SEO coverage ==`);
  console.log(`  Done      : ${done.length} / ${all_.length} (${Math.round((done.length / all_.length) * 100)}%)`);
  console.log(`  Not done  : ${notDone.length}`);

  if (done.length > 0) {
    const dates = done.map((r) => r.seoTitleUpdatedAt).filter((d): d is string => !!d).sort();
    if (dates.length > 0) {
      console.log(`  Done range: ${dates[0]} → ${dates[dates.length - 1]}`);
    }
  }

  const notDoneByAlbum = new Map<string, number>();
  for (const r of notDone) {
    const key = `${r.albumId}`;
    notDoneByAlbum.set(key, (notDoneByAlbum.get(key) ?? 0) + 1);
  }
  const top = [...notDoneByAlbum.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (top.length > 0) {
    console.log(`\n  Top albums by not-done count:`);
    for (const [albumId, count] of top) {
      const sample = notDone.find((r) => `${r.albumId}` === albumId);
      console.log(`    Album ${albumId} ("${sample?.caption}"): ${count} not done`);
    }
  }
  console.log();
}

(async () => {
  if (reportOnly) {
    await printReport();
    return;
  }

  console.log(
    `\nBackfill visual SEO  ${explicitDesignIds ? `designIds=${explicitDesignIds.join(",")}` : `limit=${limit === Infinity ? "all" : limit}`}  concurrency=${concurrency}  dryRun=${dryRun}  force=${force}`,
  );

  if (!ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY not set in .env");
    process.exit(1);
  }

  const designs = await fetchDesigns();
  console.log(`  Found ${designs.length} design(s) to process\n`);

  let ok = 0;
  let failed = 0;

  async function processOne(design: DesignRow): Promise<void> {
    const albumCaption = await getAlbumCaption(design.albumId);
    const image = await fetchImageBase64(design.albumId, design.designId);
    if (!image) {
      console.warn(`  [skip] DesignID=${design.designId} — image fetch failed`);
      failed++;
      return;
    }

    const result = await generateVisualSeo(design, albumCaption, image.base64, image.mediaType);
    if (!result) {
      failed++;
      return;
    }

    console.log(`\n  DesignID=${design.designId}  "${design.caption}"  album="${albumCaption}"  ${design.width}x${design.height}  ${design.nColors}c`);
    console.log(`    TITLE: ${result.title}`);
    console.log(`    BODY (${result.description.split(/\n\n/).length} paragraphs, ${result.description.split(/\s+/).length} words):`);
    console.log(`    ${result.description.replace(/\n/g, "\n    ")}`);
    console.log(`    SUBJECT CATEGORY: ${result.subjectCategory}`);
    console.log(`    SUBJECT BLURB (${result.subjectBlurb ? result.subjectBlurb.split(/\s+/).length : 0} words): ${result.subjectBlurb || "(empty)"}`);

    if (!dryRun) {
      await writeVisualSeo(design, result.title, result.description, result.subjectBlurb);
      console.log(`    ✓ written`);
    } else {
      console.log(`    (dry-run, not written)`);
    }
    ok++;
  }

  for (let i = 0; i < designs.length; i += concurrency) {
    const chunk = designs.slice(i, i + concurrency);
    await Promise.all(chunk.map(processOne));
    console.log(`\n  --- ${Math.min(i + concurrency, designs.length)}/${designs.length} done ---`);
  }

  console.log(`\nDone. ok=${ok}  failed=${failed}`);
})();
