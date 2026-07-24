import "dotenv/config";
import { searchConsole } from "../src/services/googleClient";

const SITE_URL = process.env.GSC_SITE_URL ?? "sc-domain:cross-stitch.com";

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

function dateStr(d: Date): string { return d.toISOString().slice(0, 10); }
function daysAgo(n: number): string { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return dateStr(d); }
function weekStart(dateVal: string): string {
  const d = new Date(dateVal + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // back to Sunday
  return dateStr(d);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`
gsc-explore.ts — flexible Search Console query

  --start YYYY-MM-DD       default: 28 days ago
  --end   YYYY-MM-DD       default: today
  --dimensions date,page,query,country,device   default: date
  --page <url>             filter to one exact page URL
  --query <text>           filter to queries containing this text
  --country <code>         filter to one country (e.g. usa)
  --dataState all|final    default: final (all = include still-processing recent days)
  --bucket day|week        only applies when "date" is a dimension; week aggregates client-side
  --site <sc-domain:...>   default: $GSC_SITE_URL or sc-domain:cross-stitch.com
  --limit N                rowLimit, default 25000
`);
  process.exit(0);
}

const startDate = (args.start as string) ?? daysAgo(28);
const endDate = (args.end as string) ?? daysAgo(0);
const dimensions = ((args.dimensions as string) ?? "date").split(",").map(s => s.trim());
const dataState = (args.dataState as string) === "all" ? "all" : "final";
const bucket = (args.bucket as string) === "week" ? "week" : "day";
const siteUrl = (args.site as string) ?? SITE_URL;
const rowLimit = args.limit ? parseInt(args.limit as string, 10) : 25000;

const filters: { dimension: string; operator: string; expression: string }[] = [];
if (args.page) filters.push({ dimension: "page", operator: "equals", expression: args.page as string });
if (args.query) filters.push({ dimension: "query", operator: "contains", expression: args.query as string });
if (args.country) filters.push({ dimension: "country", operator: "equals", expression: args.country as string });

(async () => {
  const resp = await searchConsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions,
      rowLimit,
      dataState,
      ...(filters.length ? { dimensionFilterGroups: [{ filters }] } : {}),
    },
  });

  const rows = (resp.data.rows ?? []).map(r => ({
    keys: r.keys ?? [],
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));

  if (dimensions[0] === "date" && bucket === "week") {
    const byWeek = new Map<string, { clicks: number; impressions: number; posWeighted: number }>();
    for (const r of rows) {
      const wk = weekStart(r.keys[0]);
      if (!byWeek.has(wk)) byWeek.set(wk, { clicks: 0, impressions: 0, posWeighted: 0 });
      const e = byWeek.get(wk)!;
      e.clicks += r.clicks;
      e.impressions += r.impressions;
      e.posWeighted += r.position * r.impressions;
    }
    console.log(`GSC by week, ${siteUrl}, ${startDate} -> ${endDate} (dataState=${dataState})\n`);
    console.log("week        clicks  impressions  avgPosition(impr-weighted)");
    for (const [wk, e] of [...byWeek.entries()].sort()) {
      const avgPos = e.impressions > 0 ? e.posWeighted / e.impressions : 0;
      console.log(`${wk}  ${String(e.clicks).padStart(6)}  ${String(e.impressions).padStart(11)}  ${avgPos.toFixed(1)}`);
    }
    return;
  }

  console.log(`GSC by ${dimensions.join("+")}, ${siteUrl}, ${startDate} -> ${endDate} (dataState=${dataState})\n`);
  console.log(`${dimensions.join("  ").padEnd(40)}  clicks  impressions  ctr%   avgPos`);
  rows.sort((a, b) => b.impressions - a.impressions);
  for (const r of rows) {
    console.log(
      `${r.keys.join("  ").padEnd(40)}  ${String(r.clicks).padStart(6)}  ${String(r.impressions).padStart(11)}  ${(r.ctr * 100).toFixed(2).padStart(5)}  ${r.position.toFixed(1).padStart(6)}`
    );
  }
})().catch(e => { console.error(e.message); process.exit(1); });
