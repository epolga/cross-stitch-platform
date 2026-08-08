'use client';
import { useState } from 'react';
import type { PatternPalette } from '@/lib/pattern-converter';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  width: number;
  height: number;
  grid: number[][];
  palette: PatternPalette[];
  previewImage: string | null;
  // Track 2 (Opportunity 9) provenance — when publishing an AI-draft
  // pattern, threading this through lets the server backfill designId
  // onto AiDesignGenerations/AiDesignCorrections (see route.ts), the join
  // key the prompt/corrections -> NDownloaded measurement needs. Absent
  // for a normal (non-AI) publish.
  sourceGenerationId?: string;
}

interface AlbumPreview {
  albumCaption: string;
  boardId: string | null;
}

interface PublishResult {
  designId: number;
  pinId: string;
  nPage: string;
  nGlobalPage: number;
  patternUrl: string;
  warnings: string[];
}

export default function PublishToCatalogDialog({ open, onClose, title, width, height, grid, palette, previewImage, sourceGenerationId }: Props) {
  const [albumId, setAlbumId] = useState('');
  const [preview, setPreview] = useState<AlbumPreview | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [result, setResult] = useState<PublishResult | null>(null);

  if (!open) return null;

  const usageCounts = new Array(palette.length).fill(0);
  for (const row of grid) for (const ci of row) if (ci >= 0 && ci < palette.length) usageCounts[ci]++;
  const nColors = usageCounts.filter(c => c > 0).length;

  function reset() {
    setAlbumId('');
    setPreview(null);
    setLookupError('');
    setPublishError('');
    setResult(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function lookupAlbum(id: string) {
    setPreview(null);
    setLookupError('');
    const n = parseInt(id, 10);
    if (!n || n <= 0) return;
    setLookingUp(true);
    try {
      const resp = await fetch(`/api/admin/publish-to-catalog/preview?albumId=${n}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Lookup failed');
      setPreview({ albumCaption: data.albumCaption, boardId: data.boardId });
      if (!data.boardId) setLookupError('No Pinterest board mapped to this album in AlbumBoards.csv.');
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLookingUp(false);
    }
  }

  async function publish() {
    const n = parseInt(albumId, 10);
    if (!n || n <= 0 || !preview?.boardId) return;
    setPublishing(true);
    setPublishError('');
    try {
      const resp = await fetch('/api/admin/publish-to-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albumId: n, title, width, height, grid, palette, previewImage, sourceGenerationId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Publish failed');
      setResult(data);
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={result ? undefined : handleClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-[480px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-semibold text-gray-900">Publish to Catalog</h3>
          {!result && <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>}
        </div>

        {result ? (
          <>
            <p className="text-sm text-emerald-700 mb-3">✓ Published — DesignID {result.designId}</p>
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 mb-3 text-xs text-gray-600 space-y-1">
              <p>Pinterest pin: <span className="font-mono">{result.pinId}</span></p>
              <p>Page: {result.nPage} · Global page: {result.nGlobalPage}</p>
              <p>
                <a href={result.patternUrl} target="_blank" rel="noreferrer" className="text-rose-600 underline hover:text-rose-700">
                  View design page →
                </a>
              </p>
            </div>
            {result.warnings.length > 0 && (
              <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                {result.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-800 leading-relaxed">⚠ {w}</p>
                ))}
              </div>
            )}
            <button type="button" onClick={handleClose}
              className="w-full py-2 rounded-lg bg-rose-500 text-sm font-medium text-white hover:bg-rose-600 transition-colors"
            >Done</button>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-4">
              Publishes this design to the live catalog: allocates a DesignID, uploads the kit PDFs and cover image,
              creates a real public Pinterest pin, and adds it to the site. This is real and public — not a test run.
            </p>

            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 mb-3 text-xs text-gray-600 space-y-0.5">
              <p><span className="text-gray-400">Title:</span> {title || <span className="text-red-500">(untitled — rename it first)</span>}</p>
              <p><span className="text-gray-400">Size:</span> {width} × {height} stitches</p>
              <p><span className="text-gray-400">Colors:</span> {nColors}</p>
              <p><span className="text-gray-400">Cover image:</span> {previewImage ? 'current canvas view' : 'auto-rendered (no live capture)'}</p>
            </div>

            <label className="block text-xs font-medium text-gray-600 mb-1">Album ID</label>
            <input
              type="text" inputMode="numeric" pattern="[0-9]*"
              value={albumId}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, '');
                setAlbumId(v);
                void lookupAlbum(v);
              }}
              placeholder="e.g. 15"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-rose-300"
            />

            {lookingUp && <p className="text-xs text-gray-400 mb-3">Looking up album…</p>}
            {!lookingUp && preview && (
              <p className="text-xs text-gray-500 mb-3">
                {preview.albumCaption ? `Album: ${preview.albumCaption}. ` : ''}
                {preview.boardId ? `Pinterest board: ${preview.boardId}` : ''}
              </p>
            )}
            {!lookingUp && lookupError && <p className="text-xs text-amber-700 mb-3">⚠ {lookupError}</p>}

            {publishError && <p className="mb-3 text-sm text-red-600">{publishError}</p>}

            <div className="flex gap-2">
              <button type="button" onClick={handleClose}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >Cancel</button>
              <button type="button" onClick={publish}
                disabled={publishing || !title.trim() || !preview?.boardId}
                className="flex-1 py-2 rounded-lg bg-rose-500 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >{publishing ? 'Publishing…' : 'Publish'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
