import { searchConsole } from "./googleClient";

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

export interface GscPage {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface UrlInspectionResult {
  inspectionUrl: string;
  verdict: string;
  coverageState: string;
  robotsTxtState: string;
  indexingState: string;
  lastCrawlTime?: string;
  pageFetchState: string;
  googleCanonical?: string;
  userCanonical?: string;
}

export interface GscSitemap {
  path: string;
  type: string;
  lastSubmitted?: string;
  isPending: boolean;
  isSitemapsIndex: boolean;
  lastDownloaded?: string;
  warnings: number;
  errors: number;
  contents: Array<{ type: string; submitted: number; indexed: number }>;
}

export async function listSearchConsoleSites(): Promise<GscSite[]> {
  const resp = await searchConsole.sites.list();
  return (resp.data.siteEntry ?? []).map((e) => ({
    siteUrl: e.siteUrl ?? "",
    permissionLevel: e.permissionLevel ?? "",
  }));
}

/**
 * Fetch search analytics grouped by page for the given date range.
 * Paginates automatically — GSC caps each response at 25,000 rows.
 */
export async function getSearchAnalyticsByPage(
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<GscPage[]> {
  const pages: GscPage[] = [];
  let startRow = 0;
  const rowLimit = 25000;

  while (true) {
    const resp = await searchConsole.searchanalytics.query({
      siteUrl,
      requestBody: { startDate, endDate, dimensions: ["page"], rowLimit, startRow },
    });
    const rows = resp.data.rows ?? [];
    for (const row of rows) {
      pages.push({
        page: row.keys?.[0] ?? "",
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: row.ctr ?? 0,
        position: row.position ?? 0,
      });
    }
    if (rows.length < rowLimit) break;
    startRow += rowLimit;
  }
  return pages;
}

/**
 * Run the URL Inspection API for a single URL.
 * Rate limit: 2,400 requests/day — use sparingly.
 */
export async function inspectUrl(
  siteUrl: string,
  inspectionUrl: string,
): Promise<UrlInspectionResult> {
  const resp = await searchConsole.urlInspection.index.inspect({
    requestBody: { inspectionUrl, siteUrl },
  });
  const r = resp.data.inspectionResult?.indexStatusResult;
  return {
    inspectionUrl,
    verdict: r?.verdict ?? "UNKNOWN",
    coverageState: r?.coverageState ?? "",
    robotsTxtState: r?.robotsTxtState ?? "",
    indexingState: r?.indexingState ?? "",
    lastCrawlTime: r?.lastCrawlTime ?? undefined,
    pageFetchState: r?.pageFetchState ?? "",
    googleCanonical: r?.googleCanonical ?? undefined,
    userCanonical: r?.userCanonical ?? undefined,
  };
}

export async function listSitemaps(siteUrl: string): Promise<GscSitemap[]> {
  const resp = await searchConsole.sitemaps.list({ siteUrl });
  return (resp.data.sitemap ?? []).map((s) => ({
    path: s.path ?? "",
    type: s.type ?? "",
    lastSubmitted: s.lastSubmitted ?? undefined,
    isPending: s.isPending ?? false,
    isSitemapsIndex: s.isSitemapsIndex ?? false,
    lastDownloaded: s.lastDownloaded ?? undefined,
    warnings: Number(s.warnings ?? 0),
    errors: Number(s.errors ?? 0),
    contents: (s.contents ?? []).map((c) => ({
      type: c.type ?? "",
      submitted: Number(c.submitted ?? 0),
      indexed: Number(c.indexed ?? 0),
    })),
  }));
}
