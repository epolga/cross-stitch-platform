// One-off: GSC queries landing on /photo-to-cross-stitch, to check whether
// planned FAQ/featureList wording about auto photo/line-art/illustration
// detection matches how people actually phrase these searches.
import { searchConsole } from "../src/services/googleClient";

const SITE_URL = process.env.GSC_SITE_URL || "https://cross-stitch.com/";
const DAYS = 90;

async function main() {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 3); // GSC data lags ~2-3 days
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - DAYS);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const resp = await searchConsole.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: fmt(start),
      endDate: fmt(end),
      dimensions: ["query"],
      dimensionFilterGroups: [{
        filters: [{ dimension: "page", operator: "contains", expression: "/photo-to-cross-stitch" }],
      }],
      rowLimit: 250,
    },
  });

  const rows = (resp.data.rows ?? []).map(r => ({
    query: r.keys?.[0] ?? "",
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  })).sort((a, b) => b.impressions - a.impressions);

  console.log(`${rows.length} queries, ${fmt(start)} to ${fmt(end)}\n`);
  for (const r of rows) {
    console.log(`${String(r.impressions).padStart(5)} impr  ${String(r.clicks).padStart(4)} clicks  pos ${r.position.toFixed(1).padStart(5)}  ${r.query}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
