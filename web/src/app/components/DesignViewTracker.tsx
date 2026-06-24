'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'viewed_designs';
const MAX_HISTORY = 10;

export default function DesignViewTracker({ designId }: { designId: number }) {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const viewed: number[] = raw ? JSON.parse(raw) : [];
      if (!viewed.includes(designId)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([designId, ...viewed].slice(0, MAX_HISTORY)));
      }
    } catch {}
  }, [designId]);
  return null;
}
