'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { Design } from '@/app/types/design';
import { CreateDesignUrl } from '@/lib/url-helper';
import type { MatchReason } from '@/app/api/personalized/route';

const STORAGE_KEY = 'viewed_designs';

type PersonalizedDesign = Design & { matchReason?: MatchReason };

const MATCH_LABELS: Record<MatchReason, string> = {
  simpler: 'Simpler',
  larger: 'Larger version',
  smaller: 'Smaller version',
  'similar-palette': 'Similar color count',
};

export default function PersonalizedSection() {
  const [designs, setDesigns] = useState<PersonalizedDesign[]>([]);

  useEffect(() => {
    let cancelled = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const viewedIds: number[] = raw ? JSON.parse(raw) : [];
      if (viewedIds.length === 0) return;

      fetch('/api/personalized', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewedIds }),
      })
        .then(r => r.ok ? r.json() : null)
        .then((data: { designs: PersonalizedDesign[] } | null) => {
          if (!cancelled && data?.designs?.length) setDesigns(data.designs);
        })
        .catch(() => {});
    } catch {}
    return () => { cancelled = true; };
  }, []);

  if (designs.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Based on your browsing
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {designs.map(design => (
          <Link
            key={design.DesignID}
            href={CreateDesignUrl(design)}
            className="flex-none w-28 group"
          >
            <div className="relative w-28 h-28 rounded-lg overflow-hidden border border-gray-200 group-hover:border-rose-300 transition-colors">
              {design.ImageUrl ? (
                <Image
                  src={design.ImageUrl}
                  alt={`${design.Caption} cross-stitch pattern`}
                  fill
                  className="object-cover"
                  sizes="112px"
                />
              ) : (
                <div className="w-full h-full bg-gray-100" />
              )}
              {design.matchReason && (
                <span className="absolute bottom-1 left-1 right-1 truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-white">
                  {MATCH_LABELS[design.matchReason]}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-600 leading-tight line-clamp-2 group-hover:text-rose-600 transition-colors">
              {design.Caption}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
