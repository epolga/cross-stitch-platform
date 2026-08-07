'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import PaginationControl from './PaginationControl';
import styles from './DesignList.module.css';
import type { Design } from '@/app/types/design';
import DownloadPdfLink from './DownloadPdfLink';
import EditorCTAButton from './EditorCTAButton';
import { CreateDesignUrl } from '@/lib/url-helper';
import { devLog } from '@/lib/devLog';
import { logSearchEngagementClient } from '@/lib/search-engagement-client';

type ChartFormat = 'color-symbol' | 'symbol-chart' | 'color-chart';

const chartFormatLabels: Record<ChartFormat, string> = {
  'color-symbol': 'Color & Symbol',
  'symbol-chart': 'Symbol Chart',
  'color-chart': 'Color Chart',
};

const chartFormatNumbers: Record<ChartFormat, string> = {
  'color-symbol': '1',
  'symbol-chart': '3',
  'color-chart': '5',
};

const chartFormatOptions: ChartFormat[] = ['color-symbol', 'symbol-chart', 'color-chart'];

interface DesignCardProps {
  design: Design;
  priority?: boolean;
  searchId?: string;
}

// Appends searchId to the design-page URL so a download that happens
// after clicking through (rather than the list's own DownloadPdfLink)
// can still be attributed back to this search (Track 1 Step 3 Part C).
function designUrlWithSearchId(design: Design, searchId?: string): string {
  const base = CreateDesignUrl(design);
  if (!searchId) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}searchId=${encodeURIComponent(searchId)}`;
}

let missingDesignsPromise: Promise<Set<number>> | null = null;
let missingDesignsCache: Set<number> | null = null;

async function loadMissingDesigns(): Promise<Set<number>> {
  if (!missingDesignsPromise) {
    missingDesignsPromise = fetch('/api/missing-design-pdfs', { cache: 'no-store' })
      .then((res) => res.text())
      .then((text) => {
        const set = new Set<number>();
        text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach((line) => {
            const [idStr] = line.split(',');
            const id = parseInt(idStr, 10);
            if (!Number.isNaN(id)) set.add(id);
          });
        missingDesignsCache = set;
        devLog('[DesignList] MissingDesignPdfs loaded', {
          count: set.size,
          sample: Array.from(set).slice(0, 5),
        });
        return set;
      })
      .catch((err) => {
        console.error('[DesignList] Failed to load MissingDesignPdfs.txt', err);
        return new Set<number>();
      });
  }
  return missingDesignsPromise;
}

function useMissingDesign(designId: number) {
  // Default to false (show combo) until list loads
  const [isMissing, setIsMissing] = useState<boolean>(
    missingDesignsCache ? missingDesignsCache.has(designId) : false,
  );
  const [loaded, setLoaded] = useState<boolean>(Boolean(missingDesignsCache));

  useEffect(() => {
    let isMounted = true;
    loadMissingDesigns().then((set) => {
      if (!isMounted) return;
      const nextValue = set.has(designId);
      setIsMissing(nextValue);
      setLoaded(true);
      devLog('[useMissingDesign] resolved', { designId, isMissing: nextValue });
    });
    return () => {
      isMounted = false;
    };
  }, [designId]);

  return { isMissing, loaded };
}

function DesignCard({ design, priority = false, searchId }: DesignCardProps) {
  const [selectedFormat, setSelectedFormat] = useState<ChartFormat>('color-symbol');
  const { isMissing, loaded } = useMissingDesign(design.DesignID);
  const showFormatSelector = loaded && !isMissing; // add combo only after list is loaded
  const selectId = `format-${design.DesignID}`;

  const renderDescription = (description: string) => {
    if (!description) return null;
    const parts = description.split(/(stitch(?:es|s))/i);
    if (parts.length < 3) {
      return description;
    }
    return (
      <>
        {parts[0]}
        {parts[1]}
        <br />
        {parts.slice(2).join('')}
      </>
    );
  };

  useEffect(() => {
    devLog('[DesignCard] render', {
      designId: design.DesignID,
      albumId: design.AlbumID,
      isMissing,
      loaded,
      pdfUrl: design.PdfUrl,
      selectedFormat,
    });
  }, [design.DesignID, design.AlbumID, isMissing, loaded, design.PdfUrl, selectedFormat]);

  return (
    <div className={styles.card}>
      <Link
        href={designUrlWithSearchId(design, searchId)}
        className="no-underline"
        onClick={searchId ? () => logSearchEngagementClient(searchId, design.DesignID, 'click') : undefined}
      >
        <div className="text-center">
          {design.ImageUrl ? (
            <div className={styles.imageContainer}>
              <Image
                src={design.ImageUrl}
                alt={`${design.Caption} cross-stitch pattern`}
                fill
                sizes="(max-width: 767px) 45vw, 100px"
                priority={priority}
                className="object-contain rounded"
              />
            </div>
          ) : (
            <div className={`${styles.imageContainer} bg-gray-200 rounded flex items-center justify-center`}>
              <span className="text-gray-500 text-sm">No Image</span>
            </div>
          )}
          <div className="w-full mt-2">
            <h3 className="text-lg font-semibold truncate">{design.Caption}</h3>
            <p className="text-sm text-gray-600 mt-1 line-clamp-3">{renderDescription(design.Description)}</p>
          </div>
        </div>
      </Link>
      <div className={`${styles.formatRow} mt-2 text-center`}>
        {showFormatSelector ? (
          <>
            <label htmlFor={selectId} className="sr-only">
              Select chart format
            </label>
            <select
              id={selectId}
              className={styles.formatSelect}
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value as ChartFormat)}
            >
              {chartFormatOptions.map((option) => (
                <option key={option} value={option}>
                  {chartFormatLabels[option]}
                </option>
              ))}
            </select>
          </>
        ) : (
          <div className={styles.formatPlaceholder} aria-hidden="true" />
        )}
      </div>
      <div className="w-full mt-2 text-center">
        <DownloadPdfLink
          design={design}
          className={styles.downloadLink}
          formatLabel={showFormatSelector ? chartFormatLabels[selectedFormat] : undefined}
          formatNumber={showFormatSelector ? chartFormatNumbers[selectedFormat] : undefined}
          isMissing={isMissing ?? undefined}
          searchId={searchId}
        />
      </div>
      {design.EditorPatternKey && (
        <div className="w-full mt-1 text-center">
          <EditorCTAButton
            href={`/photo-to-cross-stitch?source=design_list_catalog&catalogPatternId=${design.DesignID}`}
            label="Open in editor"
            eventName="design_editor_cta_clicked"
            eventParams={{ designId: design.DesignID, source: 'design_list_catalog' }}
            className={styles.editorLink}
          />
        </div>
      )}
    </div>
  );
}

interface DesignListProps {
  designs: Design[];
  page: number;
  totalPages: number;
  pageSize: number;
  caption?: string;
  baseUrl?: string;
  className?: string;
  isLoggedIn: boolean;
  searchId?: string;
}

export function DesignList({
  designs,
  page,
  totalPages,
  pageSize,
  caption,
  baseUrl,
  className,
  isLoggedIn,
  searchId,
}: DesignListProps) {
  // Log when isLoggedIn prop changes
  useEffect(() => {
    devLog('DesignList: isLoggedIn prop updated to', isLoggedIn);
  }, [isLoggedIn]);

  // Log on every render to confirm component rendering
  devLog('DesignList rendering with isLoggedIn:', isLoggedIn);

  return (
    <div className={`${styles.container} ${className || ''} shadow-md`}>
      {caption && <h2 className={styles.caption}>{caption}</h2>}
      <div className={styles.pagination}>
        <PaginationControl
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          baseUrl={baseUrl}
        />
      </div>
      {designs.length === 0 ? (
        <p className="text-gray-500">No designs found.</p>
      ) : (
        <div className={styles.grid}>
          {designs.map((design, index) => (
            <DesignCard key={`${design.AlbumID}-${design.DesignID}`} design={design} priority={index < 4} searchId={searchId} />
          ))}
        </div>
      )}
      <div className={styles.pagination}>
        <PaginationControl
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          baseUrl={baseUrl}
        />
      </div>
    </div>
  );
}
