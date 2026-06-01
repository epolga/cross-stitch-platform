'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import PaginationControl from './PaginationControl';
import styles from './designList.module.css';
import type { Design } from '@/app/types/design';
import DownloadPdfLink from './DownloadPdfLink';
import { CreateDesignUrl } from '@/lib/url-helper';

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
        console.log('[DesignList] MissingDesignPdfs loaded', {
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
      console.log('[useMissingDesign] resolved', { designId, isMissing: nextValue });
    });
    return () => {
      isMounted = false;
    };
  }, [designId]);

  return { isMissing, loaded };
}

function DesignCard({ design }: DesignCardProps) {
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
    console.log('[DesignCard] render', {
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
      <Link href={CreateDesignUrl(design)} className="no-underline">
        <div className="text-center">
          {design.ImageUrl ? (
            <div className="w-[100px] h-[100px] mx-auto flex items-center justify-center">
              <Image
                src={design.ImageUrl}
                alt={design.Caption}
                width={100}
                height={100}
                className="max-w-[100px] max-h-[100px] object-contain rounded"
              />
            </div>
          ) : (
            <div className="w-[100px] h-[100px] mx-auto bg-gray-200 rounded flex items-center justify-center">
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
        />
      </div>
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
}: DesignListProps) {
  // Log when isLoggedIn prop changes
  useEffect(() => {
    console.log('DesignList: isLoggedIn prop updated to', isLoggedIn);
  }, [isLoggedIn]);

  // Log on every render to confirm component rendering
  console.log('DesignList rendering with isLoggedIn:', isLoggedIn);

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
          {designs.map((design) => (
            <DesignCard key={`${design.AlbumID}-${design.DesignID}`} design={design} />
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
