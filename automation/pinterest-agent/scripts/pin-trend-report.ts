// Prints day-by-day profit/spend/revenue per promoted pin from PIN_ATTRIBUTION rows.
// Usage:  npm run pin-trend
//         npm run pin-trend -- --pin "Horse"   (filter by substring of title)
import "dotenv/config";
import { queryRange } from "../src/services/historyStore";

interface PinRow {
  SortKey: string;
  date: string;
  adId: string;
  title: string;
  clicks: number;
  outboundClicks: number;
  spend: number;
  attributedRevenue: number;
  profit: number;
}

function usd(n: number): string {
  const sign = n < 0 ? "-$" : "$";
  return sign + Math.abs(n).toFixed(2);
}

async function run() {
  const filterArg = (() => {
    const idx = process.argv.indexOf("--pin");
    return idx !== -1 ? process.argv[idx + 1]?.toLowerCase() : undefined;
  })();

  const rows = await queryRange<PinRow>("PIN_ATTRIBUTION");

  // Group by adId
  const byPin = new Map<string, { title: string; days: PinRow[] }>();
  for (const r of rows) {
    const key = r.adId;
    if (!byPin.has(key)) byPin.set(key, { title: r.title, days: [] });
    byPin.get(key)!.days.push(r);
  }

  const pins = [...byPin.values()].filter(
    (p) => !filterArg || p.title.toLowerCase().includes(filterArg)
  );

  if (pins.length === 0) {
    console.log(filterArg ? `No pins matching "${filterArg}".` : "No PIN_ATTRIBUTION rows found.");
    return;
  }

  for (const pin of pins) {
    pin.days.sort((a, b) => a.date.localeCompare(b.date));

    console.log(`\n── ${pin.title} ──`);
    console.log("Date        Clicks  Spend    Revenue  Profit");
    console.log("──────────  ──────  ───────  ───────  ───────");

    let totClicks = 0, totSpend = 0, totRev = 0, totProfit = 0;
    for (const d of pin.days) {
      const sign = d.profit >= 0 ? "+" : "";
      console.log(
        `${d.date}  ${String(d.clicks).padStart(6)}  ${usd(d.spend).padStart(7)}  ~${usd(d.attributedRevenue).padStart(6)}  ~${sign}${usd(d.profit)}`
      );
      totClicks += d.clicks;
      totSpend += d.spend;
      totRev += d.attributedRevenue;
      totProfit += d.profit;
    }
    if (pin.days.length > 1) {
      const sign = totProfit >= 0 ? "+" : "";
      console.log("──────────  ──────  ───────  ───────  ───────");
      console.log(
        `TOTAL       ${String(totClicks).padStart(6)}  ${usd(totSpend).padStart(7)}  ~${usd(totRev).padStart(6)}  ~${sign}${usd(totProfit)}`
      );
    }
  }
}

run().catch(console.error);
