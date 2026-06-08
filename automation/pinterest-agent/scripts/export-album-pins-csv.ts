import "dotenv/config";
import { writeFileSync } from "fs";
import { queryRange } from "../src/services/historyStore";

interface Row {
  SortKey: string;
  pinId: string;
  designId: number;
  designCaption: string;
  albumCaption: string;
  pinLinkType?: string;
  designUrl?: string;
}

async function main() {
  const rows = await queryRange<Row>("DESIGN_PIN_MAP");
  const albums = rows
    .filter(r => r.pinLinkType?.toUpperCase() === "ALBUM")
    .sort((a, b) => (a.albumCaption || "").localeCompare(b.albumCaption || "") || a.designId - b.designId);

  // Pin IDs are 18-digit numbers — wrap in ="..." so Excel treats them as text
  const lines = ["Album,Design ID,Design Caption,Pin ID,Design URL"];
  for (const r of albums) {
    const album = (r.albumCaption || "").replace(/,/g, ";");
    const caption = (r.designCaption || "").replace(/,/g, ";");
    const url = r.designUrl ? `https://www.cross-stitch.com${r.designUrl}` : "";
    lines.push(`${album},${r.designId},${caption},="${r.pinId}",${url}`);
  }

  const outPath = "album-pins-to-fix.csv";
  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Written ${albums.length} rows → ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
