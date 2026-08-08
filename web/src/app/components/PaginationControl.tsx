"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from 'next/image';
import styles from './PaginationControl.module.css';

interface PaginationControlProps {
  page: number;
  totalPages: number;
  pageSize: number;
  baseUrl?: string;
}

export default function PaginationControl({ page, totalPages, pageSize, baseUrl = "/" }: PaginationControlProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageSizeOptions = [10, 20, 50];

  // Real, crawlable URL for a given page/pageSize — used for both the <Link
  // href> pagination controls (so Googlebot can discover/follow them; it
  // does not execute onClick handlers to find new URLs) and the <select>'s
  // programmatic navigation below.
  const hrefFor = (newPage: number, newPageSize?: number): string => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('pageSize', String(newPageSize ?? pageSize));
    params.set('nPage', String(newPage));
    return `${baseUrl}?${params.toString()}`;
  };

  return (
    <div className={styles.pagination}>
      <label htmlFor="pageSize" className={styles.label}>Items per page:</label>
      <select
        id="pageSize"
        value={pageSize}
        onChange={(e) => router.push(hrefFor(1, Number(e.target.value)))}
        className={styles.select}
      >
        {pageSizeOptions.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
      <p>Page {page} of {totalPages}</p>

      {page === 1 ? (
        <span className={`${styles.button} ${styles.disabled}`} aria-label="First page" title="First page" aria-disabled="true">
          <Image src="/arrow-start-left-icon.svg" alt="" width={16} height={16} className={styles.iconSmall} aria-hidden="true" />
        </span>
      ) : (
        <Link href={hrefFor(1)} className={styles.button} aria-label="First page" title="First page">
          <Image src="/arrow-start-left-icon.svg" alt="" width={16} height={16} className={styles.iconSmall} aria-hidden="true" />
        </Link>
      )}

      {page === 1 ? (
        <span className={`${styles.button} ${styles.disabled}`} aria-label="Previous page" title="Previous page" aria-disabled="true">
          <Image src="/angle-circle-left-icon.svg" alt="" width={32} height={32} className={styles.iconLarge} aria-hidden="true" />
        </span>
      ) : (
        <Link href={hrefFor(page - 1)} className={styles.button} aria-label="Previous page" title="Previous page">
          <Image src="/angle-circle-left-icon.svg" alt="" width={32} height={32} className={styles.iconLarge} aria-hidden="true" />
        </Link>
      )}

      {page === totalPages ? (
        <span className={`${styles.button} ${styles.disabled}`} aria-label="Next page" title="Next page" aria-disabled="true">
          <Image src="/angle-circle-right-icon.svg" alt="" width={32} height={32} className={styles.iconLarge} aria-hidden="true" />
        </span>
      ) : (
        <Link href={hrefFor(page + 1)} className={styles.button} aria-label="Next page" title="Next page">
          <Image src="/angle-circle-right-icon.svg" alt="" width={32} height={32} className={styles.iconLarge} aria-hidden="true" />
        </Link>
      )}

      {page === totalPages ? (
        <span className={`${styles.button} ${styles.disabled}`} aria-label="Last page" title="Last page" aria-disabled="true">
          <Image src="/arrow-end-right-icon.svg" alt="" width={16} height={16} className={styles.iconSmall} aria-hidden="true" />
        </span>
      ) : (
        <Link href={hrefFor(totalPages)} className={styles.button} aria-label="Last page" title="Last page">
          <Image src="/arrow-end-right-icon.svg" alt="" width={16} height={16} className={styles.iconSmall} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
