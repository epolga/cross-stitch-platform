/**
 * Find near-duplicate designs in the catalog — metadata-candidate pass.
 *
 * Groups all DESIGN rows by (normalized Caption, AlbumID, Width, Height,
 * NColors). Any group with 2+ members is a strong duplicate candidate: this
 * is exactly the signature that flagged the known DesignID 5421/5422 "Tiger"
 * pair (see docs/Focus.md Pending #13, Gap 3) — same caption, same album,
 * same dimensions, same color count, from two visually near-identical
 * source images.
 *
 * This is a metadata pass only (no image download/hashing) — cheap, fast,
 * and a reasonable first cut. It will produce false positives (same specs,
 * genuinely different image) and can't catch true near-duplicates whose
 * metadata differs (e.g. a mirrored or recolored variant with a different
 * NColors). Visual confirmation (perceptual hashing) is a deliberate
 * follow-up, not done here.
 *
 * Output: reports/duplicate-designs.json (all candidate groups, sorted by
 * group size) + a console summary.
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const ITEMS_TABLE = process.env.ITEMS_TABLE_NAME ?? "CrossStitchItems";
const REGION = process.env.AWS_REGION ?? "us-east-1";
const SITE_BASE_URL = process.env.SITE_BASE_URL ?? "https://cross-stitch.com";

interface DesignRow {
  DesignID: number;
  AlbumID: number;
  Caption: string;
  Width: number;
  Height: number;
  NColors: number;
  NPage: number;
  ImageUrl?: string;
}

// Mirrors web/src/lib/url-helper.ts CreateDesignUrl exactly.
function createDesignUrl(row: DesignRow): string {
  const formattedCaption = row.Caption.replace(/\s+/g, "-");
  return `${SITE_BASE_URL}/${formattedCaption}-${row.AlbumID}-${row.NPage - 1}-Free-Design.aspx`;
}

async function fetchAllDesignRows(): Promise<DesignRow[]> {
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
    marshallOptions: { removeUndefinedValues: true },
  });

  const rows: DesignRow[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const resp = await ddb.send(
      new QueryCommand({
        TableName: ITEMS_TABLE,
        IndexName: "Designs-index",
        KeyConditionExpression: "EntityType = :et",
        ExpressionAttributeValues: { ":et": "DESIGN" },
        ProjectionExpression: "DesignID, AlbumID, Caption, Width, Height, NColors, NPage, ImageUrl",
        ExclusiveStartKey: exclusiveStartKey as Record<string, import("@aws-sdk/client-dynamodb").AttributeValue> | undefined,
      }),
    );

    for (const item of resp.Items ?? []) {
      const designId = item["DesignID"] as number | undefined;
      const albumId = item["AlbumID"] as number | undefined;
      const caption = item["Caption"] as string | undefined;
      const width = item["Width"] as number | undefined;
      const height = item["Height"] as number | undefined;
      const nColors = item["NColors"] as number | undefined;
      // NPage is stored as a String attribute (see data-access.ts: item.NPage?.S), not a Number.
      const rawNPage = item["NPage"] as string | number | undefined;
      const nPage = rawNPage !== undefined ? parseInt(String(rawNPage), 10) : NaN;
      if (
        designId === undefined ||
        albumId === undefined ||
        !caption ||
        width === undefined ||
        height === undefined ||
        nColors === undefined ||
        !Number.isFinite(nPage)
      ) {
        continue;
      }
      rows.push({
        DesignID: designId,
        AlbumID: albumId,
        Caption: caption,
        Width: width,
        Height: height,
        NColors: nColors,
        NPage: nPage,
        ImageUrl: item["ImageUrl"] as string | undefined,
      });
    }

    exclusiveStartKey = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
    process.stdout.write(`  scanned ${rows.length} design row(s)\r`);
  } while (exclusiveStartKey);

  process.stdout.write("\n");
  return rows;
}

function normalizeCaption(caption: string): string {
  return caption.trim().toLowerCase().replace(/\s+/g, " ");
}

function groupKey(row: DesignRow): string {
  return `${normalizeCaption(row.Caption)}|${row.AlbumID}|${row.Width}|${row.Height}|${row.NColors}`;
}

interface DuplicateGroup {
  caption: string;
  albumId: number;
  width: number;
  height: number;
  nColors: number;
  designs: { designId: number; designUrl: string; imageUrl: string }[];
}

(async () => {
  console.log(`Scanning ${ITEMS_TABLE} in ${REGION} for DESIGN rows...`);
  const rows = await fetchAllDesignRows();
  console.log(`  ${rows.length} design(s) with complete metadata`);

  const groups = new Map<string, DesignRow[]>();
  for (const row of rows) {
    const key = groupKey(row);
    const arr = groups.get(key);
    if (arr) arr.push(row);
    else groups.set(key, [row]);
  }

  const duplicateGroups: DuplicateGroup[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    duplicateGroups.push({
      caption: members[0].Caption,
      albumId: members[0].AlbumID,
      width: members[0].Width,
      height: members[0].Height,
      nColors: members[0].NColors,
      designs: members
        .sort((a, b) => a.DesignID - b.DesignID)
        .map((m) => ({
          designId: m.DesignID,
          designUrl: createDesignUrl(m),
          imageUrl: m.ImageUrl || `https://d2o1uvvg91z7o4.cloudfront.net/photos/${m.AlbumID}/${m.DesignID}/4.jpg`,
        })),
    });
  }

  function designId0(g: DuplicateGroup): number {
    return g.designs[0]?.designId ?? 0;
  }

  duplicateGroups.sort((a, b) => b.designs.length - a.designs.length || designId0(a) - designId0(b));

  const totalDuplicateDesigns = duplicateGroups.reduce((s, g) => s + g.designs.length, 0);

  const report = {
    generatedAt: new Date().toISOString(),
    method: "metadata-candidate (Caption+AlbumID+Width+Height+NColors exact match) — NOT visually confirmed",
    totalDesignsScanned: rows.length,
    duplicateGroupCount: duplicateGroups.length,
    totalDesignsInDuplicateGroups: totalDuplicateDesigns,
    groups: duplicateGroups,
  };

  const reportsDir = path.join(process.cwd(), "reports");
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, "duplicate-designs.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");

  console.log(`\n═══ Duplicate-candidate groups (metadata match) ═══════════════`);
  console.log(`  Designs scanned:        ${rows.length}`);
  console.log(`  Candidate groups:       ${duplicateGroups.length}`);
  console.log(`  Designs in those groups: ${totalDuplicateDesigns}`);
  console.log(`  Saved → ${reportPath}\n`);

  for (const g of duplicateGroups) {
    console.log(`  "${g.caption}" (album ${g.albumId}, ${g.width}×${g.height}, ${g.nColors} colors)`);
    for (const d of g.designs) {
      console.log(`      ${d.designUrl}`);
    }
  }
  console.log(`═══════════════════════════════════════════════════════════════\n`);
})();
