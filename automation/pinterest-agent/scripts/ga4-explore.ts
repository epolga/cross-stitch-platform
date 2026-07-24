import "dotenv/config";
import { analyticsData, GA4_PROPERTY_ID } from "../src/services/googleClient";

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

// short aliases -> real GA4 API names, so callers don't need to memorize them
const DIMENSION_ALIASES: Record<string, string> = {
  date: "date",
  hour: "hour",
  channel: "sessionDefaultChannelGroup",
  country: "country",
  device: "deviceCategory",
  page: "pagePath",
  source: "sessionSource",
  medium: "sessionMedium",
};
const METRIC_ALIASES: Record<string, string> = {
  sessions: "sessions",
  pageviews: "screenPageViews",
  users: "activeUsers",
  engagedSessions: "engagedSessions",
};

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`
ga4-explore.ts — flexible GA4 query, with a cumulative-by-hour mode for
"is today's pace behind yesterday's at the same time" comparisons

  --start <date>            YYYY-MM-DD or GA4 relative string (e.g. 3daysAgo). default: 7daysAgo
  --end   <date>            default: today
  --dimensions ...          comma list of: ${Object.keys(DIMENSION_ALIASES).join(", ")}
                            default: date
  --metrics ...             comma list of: ${Object.keys(METRIC_ALIASES).join(", ")}
                            default: sessions,pageviews
  --cumulative              when dimensions include "hour", pivot to one column
                            per date showing running-total-by-hour (needs "date"
                            in --dimensions too)

Example — compare today's traffic pace to the last 2 days at the same hour:
  npx tsx scripts/ga4-explore.ts --start 3daysAgo --end today \\
    --dimensions date,hour --metrics sessions,pageviews --cumulative
`);
  process.exit(0);
}

const startDate = (args.start as string) ?? "7daysAgo";
const endDate = (args.end as string) ?? "today";
const dimensionKeys = ((args.dimensions as string) ?? "date").split(",").map(s => s.trim());
const metricKeys = ((args.metrics as string) ?? "sessions,pageviews").split(",").map(s => s.trim());
const cumulative = !!args.cumulative;

const dimensions = dimensionKeys.map(k => {
  const name = DIMENSION_ALIASES[k];
  if (!name) throw new Error(`Unknown dimension "${k}". Known: ${Object.keys(DIMENSION_ALIASES).join(", ")}`);
  return { name };
});
const metrics = metricKeys.map(k => {
  const name = METRIC_ALIASES[k];
  if (!name) throw new Error(`Unknown metric "${k}". Known: ${Object.keys(METRIC_ALIASES).join(", ")}`);
  return { name };
});

(async () => {
  const response = await analyticsData.properties.runReport({
    property: `properties/${GA4_PROPERTY_ID}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions,
      metrics,
      orderBys: dimensionKeys.map(k => ({ dimension: { dimensionName: DIMENSION_ALIASES[k] } })),
      limit: "100000",
    },
  });

  const rows = response.data.rows ?? [];
  const parsed = rows.map(r => ({
    keys: dimensionKeys.map((_, i) => r.dimensionValues?.[i]?.value ?? "?"),
    values: metricKeys.map((_, i) => parseInt(r.metricValues?.[i]?.value ?? "0", 10)),
  }));

  if (cumulative && dimensionKeys.includes("hour") && dimensionKeys.includes("date")) {
    const dateIdx = dimensionKeys.indexOf("date");
    const hourIdx = dimensionKeys.indexOf("hour");
    const dates = [...new Set(parsed.map(p => p.keys[dateIdx]))].sort();

    for (let m = 0; m < metricKeys.length; m++) {
      console.log(`\ncumulative ${metricKeys[m]} by hour:`);
      console.log("hour  " + dates.map(d => d.padStart(10)).join("  "));
      const cum = new Map<string, number>();
      for (let h = 0; h < 24; h++) {
        const line: string[] = [];
        for (const d of dates) {
          const row = parsed.find(p => p.keys[dateIdx] === d && parseInt(p.keys[hourIdx], 10) === h);
          const prev = cum.get(d) ?? 0;
          const total = prev + (row?.values[m] ?? 0);
          cum.set(d, total);
          line.push(String(total).padStart(10));
        }
        console.log(`${String(h).padStart(2, "0")}h  ` + line.join("  "));
      }
    }
    return;
  }

  console.log(`GA4 by ${dimensionKeys.join("+")}, ${startDate} -> ${endDate}\n`);
  console.log(`${dimensionKeys.join("  ").padEnd(30)}  ${metricKeys.map(k => k.padStart(12)).join("  ")}`);
  for (const r of parsed) {
    console.log(`${r.keys.join("  ").padEnd(30)}  ${r.values.map(v => String(v).padStart(12)).join("  ")}`);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
