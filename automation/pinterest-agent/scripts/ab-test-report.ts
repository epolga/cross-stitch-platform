import "dotenv/config";
import { queryRange } from "../src/services/historyStore";

interface DesignPinMapRow {
  designId: number;
  pinId: string;
  designCaption: string;
  albumCaption: string;
  pinLinkType?: string;
}

interface DesignPerfRow {
  snapshotDate: string;
  pinId: string;
  impressions: number;
  clicks: number;
  saves: number;
  ctr: number;
  savesPerDay?: number;
  impressionsPerDay?: number;
  error?: string;
}

interface GroupStats {
  count: number;
  totalImpressions: number;
  totalClicks: number;
  totalSaves: number;
  totalCtr: number;
  totalSavesPerDay: number;
  totalImpressionsPerDay: number;
  countWithRates: number;
}

function avg(total: number, count: number, decimals = 1): string {
  if (count === 0) return "—";
  return (total / count).toFixed(decimals);
}

function pctDiff(a: number, b: number): string {
  if (b === 0) return "N/A";
  const diff = ((a - b) / b) * 100;
  return (diff >= 0 ? "+" : "") + diff.toFixed(0) + "%";
}

function fmtCtr(totalCtr: number, count: number): string {
  if (count === 0) return "—";
  return ((totalCtr / count) * 100).toFixed(2) + "%";
}

function tableRow(cells: string[], widths: number[]): string {
  return cells.map((v, i) => v.padStart(widths[i])).join(" | ");
}

async function main() {
  // Load pin map — has pinLinkType if `npm run pinmap` was run recently
  const pinMapRows = await queryRange<DesignPinMapRow>("DESIGN_PIN_MAP");
  const pinLinkTypeByPinId = new Map<string, string>();
  for (const row of pinMapRows) {
    if (row.pinId) {
      pinLinkTypeByPinId.set(row.pinId, row.pinLinkType?.toUpperCase() ?? "UNKNOWN");
    }
  }
  console.log(`Loaded ${pinMapRows.length} design-pin records`);

  // Load latest DESIGN_PERFORMANCE snapshot
  const allPerf = await queryRange<DesignPerfRow>("DESIGN_PERFORMANCE", {
    scanForward: false,
    limit: 500,
  });
  if (allPerf.length === 0) {
    console.error("No DESIGN_PERFORMANCE rows found. Run `npm run perf` first.");
    process.exit(1);
  }

  const latestDate = allPerf[0].snapshotDate;
  const perfRows = allPerf.filter((r) => r.snapshotDate === latestDate && !r.error);
  const errorRows = allPerf.filter((r) => r.snapshotDate === latestDate && r.error);
  console.log(
    `Using snapshot: ${latestDate} (${perfRows.length} pins with data, ${errorRows.length} errors)`
  );

  // Group by pinLinkType
  const groups = new Map<string, GroupStats>();

  for (const row of perfRows) {
    const linkType = pinLinkTypeByPinId.get(row.pinId) ?? "UNKNOWN";
    let g = groups.get(linkType);
    if (!g) {
      g = {
        count: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalSaves: 0,
        totalCtr: 0,
        totalSavesPerDay: 0,
        totalImpressionsPerDay: 0,
        countWithRates: 0,
      };
      groups.set(linkType, g);
    }
    g.count++;
    g.totalImpressions += row.impressions;
    g.totalClicks += row.clicks;
    g.totalSaves += row.saves;
    g.totalCtr += row.ctr;
    if (row.savesPerDay !== undefined && row.impressionsPerDay !== undefined) {
      g.totalSavesPerDay += row.savesPerDay;
      g.totalImpressionsPerDay += row.impressionsPerDay;
      g.countWithRates++;
    }
  }

  // Print report
  console.log("\n" + "=".repeat(80));
  console.log("A/B Test: DESIGN vs ALBUM pin destination");
  console.log(`Snapshot: ${latestDate} (30-day window)`);
  console.log("=".repeat(80));

  const header = ["Type", "Pins", "Imp/pin", "Clicks/pin", "Saves/pin", "Avg CTR", "Saves/day", "Imp/day"];
  const dataRows: string[][] = [];

  for (const [type, g] of [...groups.entries()].sort()) {
    dataRows.push([
      type,
      g.count.toString(),
      avg(g.totalImpressions, g.count, 0),
      avg(g.totalClicks, g.count, 1),
      avg(g.totalSaves, g.count, 1),
      fmtCtr(g.totalCtr, g.count),
      avg(g.totalSavesPerDay, g.countWithRates, 3),
      avg(g.totalImpressionsPerDay, g.countWithRates, 1),
    ]);
  }

  const allRows = [header, ...dataRows];
  const widths = header.map((_, i) => Math.max(...allRows.map((r) => r[i].length)));
  const sep = widths.map((w) => "-".repeat(w)).join("-+-");

  console.log(tableRow(header, widths));
  console.log(sep);
  for (const row of dataRows) console.log(tableRow(row, widths));

  // ALBUM vs DESIGN comparison
  const dg = groups.get("DESIGN");
  const ag = groups.get("ALBUM");
  if (dg && ag) {
    console.log("\nALBUM vs DESIGN (per-pin averages):");
    const comparisons: Array<[string, number, number, number]> = [
      ["Impressions/pin", ag.totalImpressions / ag.count, dg.totalImpressions / dg.count, 0],
      ["Clicks/pin",      ag.totalClicks / ag.count,      dg.totalClicks / dg.count,      1],
      ["Saves/pin",       ag.totalSaves / ag.count,       dg.totalSaves / dg.count,        1],
      ["Avg CTR",         ag.totalCtr / ag.count,         dg.totalCtr / dg.count,          4],
      ...(ag.countWithRates > 0 && dg.countWithRates > 0
        ? [
            ["Saves/day", ag.totalSavesPerDay / ag.countWithRates, dg.totalSavesPerDay / dg.countWithRates, 3] as [string, number, number, number],
            ["Imp/day",   ag.totalImpressionsPerDay / ag.countWithRates, dg.totalImpressionsPerDay / dg.countWithRates, 1] as [string, number, number, number],
          ]
        : []),
    ];
    for (const [label, aVal, dVal, dec] of comparisons) {
      const diff = pctDiff(aVal, dVal);
      console.log(
        `  ${label.padEnd(15)} ${diff.padStart(6)}  (ALBUM ${aVal.toFixed(dec)} vs DESIGN ${dVal.toFixed(dec)})`
      );
    }
  }

  if (groups.has("UNKNOWN")) {
    const u = groups.get("UNKNOWN")!;
    console.log(
      `\nNote: ${u.count} pins have no PinLinkType recorded — run \`npm run pinmap\` to refresh DESIGN_PIN_MAP`
    );
  }
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
