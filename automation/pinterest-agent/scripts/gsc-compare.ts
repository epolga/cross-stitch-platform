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
function daysBetween(start: string, end: string): number {
  const a = new Date(start + "T00:00:00Z").getTime();
  const b = new Date(end + "T00:00:00Z").getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`
gsc-compare.ts — compare a GSC dimension across two date ranges (baseline vs recent)

  --dimension page|query          what to break down by (default: page)
  --baseline-start / --baseline-end   e.g. a full prior week
  --recent-start   / --recent-end     e.g. the last 2-3 days (use --dataState all to catch them)
  --filter-page <url>             restrict to one page (useful with --dimension query)
  --dataState all|final           default: all (recent days are usually still processing)
  --top N                         rows to print, default 20 (sorted by baseline impressions)
  --site <sc-domain:...>          default: $GSC_SITE_URL or sc-domain:cross-stitch.com

Example: find which pages/queries moved between a stable baseline week and the
last couple of days:
  npx tsx scripts/gsc-compare.ts --dimension page \\
    --baseline-start 2026-07-15 --baseline-end 2026-07-21 \\
    --recent-start 2026-07-22 --recent-end 2026-07-23
`);
  process.exit(0);
}

const dimension = (args.dimension as string) ?? "page";
const baselineStart = (args["baseline-start"] as string) ?? daysAgo(14);
const baselineEnd = (args["baseline-end"] as string) ?? daysAgo(8);
const recentStart = (args["recent-start"] as string) ?? daysAgo(2);
const recentEnd = (args["recent-end"] as string) ?? daysAgo(0);
const dataState = (args.dataState as string) === "final" ? "final" : "all";
const top = args.top ? parseInt(args.top as string, 10) : 20;
const siteUrl = (args.site as string) ?? SITE_URL;

const filters = args["filter-page"]
  ? [{ dimension: "page", operator: "equals", expression: args["filter-page"] as string }]
  : [];

async function pull(startDate: string, endDate: string) {
  const resp = await searchConsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: [dimension],
      rowLimit: 25000,
      dataState,
      ...(filters.length ? { dimensionFilterGroups: [{ filters }] } : {}),
    },
  });
  return (resp.data.rows ?? []).map(r => ({
    key: r.keys?.[0] ?? "",
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    position: r.position ?? 0,
  }));
}

(async () => {
  const baseline = await pull(baselineStart, baselineEnd);
  const recent = await pull(recentStart, recentEnd);
  const baselineDays = daysBetween(baselineStart, baselineEnd);
  const recentDays = daysBetween(recentStart, recentEnd);

  const recentMap = new Map(recent.map(r => [r.key, r]));
  console.log(
    `Baseline ${baselineStart}..${baselineEnd} (${baselineDays}d, ${baseline.length} ${dimension}s) vs ` +
    `Recent ${recentStart}..${recentEnd} (${recentDays}d, ${recent.length} ${dimension}s), dataState=${dataState}\n`
  );

  const merged = baseline.map(b => {
    const r = recentMap.get(b.key);
    return {
      key: b.key,
      baseImprPerDay: b.impressions / baselineDays,
      basePos: b.position,
      recentImprPerDay: (r?.impressions ?? 0) / recentDays,
      recentPos: r?.position ?? 0,
      hasRecent: !!r,
    };
  });
  merged.sort((a, b) => b.baseImprPerDay - a.baseImprPerDay);

  console.log(`top ${top} by baseline impressions/day:\n`);
  for (const m of merged.slice(0, top)) {
    const posDelta = m.hasRecent ? (m.recentPos - m.basePos).toFixed(1) : "n/a";
    console.log(
      `${m.key}\n   baseline: ${m.baseImprPerDay.toFixed(0)} impr/day, pos ${m.basePos.toFixed(1)}` +
      `  |  recent: ${m.recentImprPerDay.toFixed(0)} impr/day, pos ${m.hasRecent ? m.recentPos.toFixed(1) : "-"}` +
      `  (Δpos ${posDelta})`
    );
  }
})().catch(e => { console.error(e.message); process.exit(1); });
