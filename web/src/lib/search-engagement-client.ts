'use client';

// Client-side fire-and-forget relevance signal for Track 1 Step 3
// (retrieval eval) — shared by DesignList.tsx (click) and
// DownloadPdfLink.tsx (download). `keepalive` lets the request survive
// the page navigation a click/download normally causes.
export function logSearchEngagementClient(
  searchId: string,
  designId: number,
  action: 'click' | 'download',
) {
  fetch('/api/search-engagement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({ searchId, designId, action }),
  }).catch(() => {});
}
