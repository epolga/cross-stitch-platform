'use client';

import type { AffiliateStoreUrls } from '@/lib/affiliate-config';

interface Material {
  name: string;
  category: string;
}

const MATERIALS: Material[] = [
  { name: 'Embroidery floss', category: 'floss' },
  { name: 'White Aida fabric', category: 'fabric' },
  { name: 'Tapestry needles', category: 'needles' },
  { name: 'Embroidery hoop', category: 'hoop' },
  { name: 'Thread organizer', category: 'organizer' },
];

interface Props {
  stores: AffiliateStoreUrls;
  designId?: string;
  designName?: string;
}

type GtagFn = (...args: unknown[]) => void;

function trackAffiliateClick(
  store: string,
  category: string,
  url: string,
  designId: string | undefined,
  designName: string | undefined,
): void {
  if (typeof window === 'undefined') return;
  const gtag = (window as Window & { gtag?: GtagFn }).gtag;
  if (typeof gtag !== 'function') return;
  gtag('event', 'affiliate_material_click', {
    store,
    item_category: category,
    design_id: designId,
    design_name: designName,
    page_path: window.location.pathname,
    link_url: url,
  });
}

export default function AffiliateMaterials({ stores, designId, designName }: Props) {
  if (!stores.lovecrafts && !stores.amazon) return null;

  const configuredStores = [
    stores.lovecrafts ? { key: 'lovecrafts', label: 'LoveCrafts', url: stores.lovecrafts } : null,
    stores.amazon ? { key: 'amazon', label: 'Amazon', url: stores.amazon } : null,
  ].filter((s): s is { key: string; label: string; url: string } => s !== null);

  return (
    <section
      aria-label="Recommended materials"
      className="mt-5 mb-4 border border-gray-200 rounded-lg p-4 text-sm bg-gray-50"
    >
      <h2 className="font-semibold text-gray-800 mb-1 text-base">Everything you need to start</h2>
      <p className="text-gray-600 mb-3 text-sm">Get the basic supplies you need to stitch this pattern.</p>
      <ul className="space-y-2 mb-3">
        {MATERIALS.map((material) => (
          <li key={material.category} className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-gray-700 text-sm">{material.name}</span>
            <span className="flex gap-3">
              {configuredStores.map((store) => (
                <a
                  key={store.key}
                  href={store.url}
                  target="_blank"
                  rel="sponsored nofollow noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 hover:underline text-xs font-medium"
                  onClick={() =>
                    trackAffiliateClick(store.key, material.category, store.url, designId, designName)
                  }
                >
                  {store.label}
                  <span className="sr-only"> (opens in new tab)</span>
                </a>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-400 border-t border-gray-200 pt-2 mt-2">
        This page contains affiliate links. We may earn a small commission at no additional cost to you.
      </p>
    </section>
  );
}
