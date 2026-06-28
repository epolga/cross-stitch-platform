'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import type { ConvertedPattern } from '@/lib/pattern-converter';

const COLOR_OPTIONS = [5, 10, 20, 30, 40, 50, 100] as const;

interface Props {
  open: boolean;
  initialFile?: File | null;
  onClose: () => void;
  onImport: (data: ConvertedPattern, paddedGrid: number[][]) => void;
}

export default function ImportFromPhotoDialog({ open, initialFile, onClose, onImport }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [patWidth, setPatWidth] = useState(80);
  const [patHeight, setPatHeight] = useState(80);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [lockAspect, setLockAspect] = useState(true);
  const [numColors, setNumColors] = useState<5 | 10 | 20 | 30 | 40 | 50 | 100>(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const selectedFile = useRef<File | null>(null);

  useEffect(() => {
    if (open && initialFile) handleFile(initialFile);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Please upload an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image too large — max 5 MB.'); return; }
    selectedFile.current = file;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setError('');
    const img = document.createElement('img');
    img.onload = () => setAspectRatio(img.naturalWidth / img.naturalHeight);
    img.src = url;
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  async function convert() {
    if (!selectedFile.current) return;
    setLoading(true);
    setError('');
    try {
      let innerW = patWidth, innerH = patHeight;
      if (aspectRatio) {
        const fitH = Math.round(patWidth / aspectRatio);
        if (fitH <= patHeight) { innerH = Math.max(10, fitH); }
        else { innerW = Math.max(10, Math.round(patHeight * aspectRatio)); innerH = patHeight; }
      }
      const form = new FormData();
      form.append('image', selectedFile.current);
      form.append('width', String(innerW));
      form.append('height', String(innerH));
      form.append('colors', String(numColors));
      const resp = await fetch('/api/convert', { method: 'POST', body: form });
      if (!resp.ok) {
        const { error: msg } = await resp.json().catch(() => ({ error: 'Conversion failed' }));
        throw new Error(msg);
      }
      const data = await resp.json() as ConvertedPattern;

      const padTop = Math.floor((patHeight - innerH) / 2);
      const padLeft = Math.floor((patWidth - innerW) / 2);
      const paddedGrid: number[][] = Array.from({ length: patHeight }, () => Array(patWidth).fill(-1));
      for (let r = 0; r < data.grid.length; r++)
        for (let c = 0; c < data.grid[r].length; c++) {
          const or = padTop + r, oc = padLeft + c;
          if (or < patHeight && oc < patWidth) paddedGrid[or][oc] = data.grid[r][c];
        }

      onImport(data, paddedGrid);
      // Reset for next use
      setPreviewUrl(null);
      selectedFile.current = null;
      setAspectRatio(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversion failed');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-[480px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-semibold text-gray-900">Import from Photo</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
        </div>
        <p className="text-xs text-gray-500 mb-4">Upload any photo and I&apos;ll convert it into a stitchable cross-stitch pattern using real DMC thread colors.</p>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors p-6 mb-2
            ${dragOver ? 'border-rose-400 bg-rose-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
        >
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          {previewUrl ? (
            <div className="relative w-36 h-36">
              <Image src={previewUrl} alt="Selected" fill className="object-contain rounded" unoptimized />
            </div>
          ) : (
            <>
              <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-gray-500">Drag & drop or <span className="text-rose-600 font-medium">click to upload</span></p>
              <p className="text-xs text-gray-400">JPEG, PNG, WebP — max 5 MB</p>
            </>
          )}
        </div>

        {previewUrl && (
          <button type="button" onClick={() => { setPreviewUrl(null); selectedFile.current = null; if (fileRef.current) fileRef.current.value = ''; }}
            className="text-xs text-gray-400 hover:text-gray-600 mb-3 block"
          >Remove photo</button>
        )}

        {/* Size */}
        <div className="flex items-end gap-2 mb-1">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Width (stitches)</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={patWidth || ''}
              onChange={e => {
                const w = parseInt(e.target.value.replace(/\D/g, '')) || 0;
                setPatWidth(w);
                if (lockAspect && aspectRatio && w > 0) setPatHeight(Math.round(w / aspectRatio));
              }}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          </div>
          <button type="button" onClick={() => setLockAspect(l => !l)}
            title={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            className={`mb-1 text-lg px-1 transition-opacity ${lockAspect ? 'opacity-100' : 'opacity-30'}`}
          >{lockAspect ? '🔗' : '🔓'}</button>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Height (stitches)</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={patHeight || ''}
              onChange={e => {
                const h = parseInt(e.target.value.replace(/\D/g, '')) || 0;
                setPatHeight(h);
                if (lockAspect && aspectRatio && h > 0) setPatWidth(Math.round(h * aspectRatio));
              }}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          </div>
        </div>

        <p className="text-xs text-gray-400 mb-4">
          A good beginner size is 50–80 stitches wide. Larger = more detail, but more stitches to complete.
          The <span className="font-medium">🔗</span> button locks width and height together so the photo isn&apos;t stretched.
        </p>

        {/* Colors */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-gray-600 mb-0.5">How many thread colors?</label>
          <p className="text-xs text-gray-400 mb-2">Fewer colors = easier to stitch. Start with 10 or 15 if you&apos;re new to cross-stitch.</p>
          <div className="flex flex-wrap gap-2">
            {COLOR_OPTIONS.map(n => (
              <button key={n} type="button" onClick={() => setNumColors(n)}
                title={n <= 5 ? 'Very simple — great for total beginners' : n <= 10 ? 'Simple, great for beginners' : n <= 20 ? 'Good balance of detail and simplicity' : n <= 40 ? 'More detailed, more thread colors to manage' : n <= 50 ? 'Complex, rich in color detail' : 'Maximum detail — suitable for advanced stitchers'}
                className={`px-3 py-1.5 rounded border text-sm font-medium transition-colors
                  ${numColors === n ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-gray-700 border-gray-300 hover:border-rose-300'}`}
              >{n}</button>
            ))}
          </div>
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >Cancel</button>
          <button type="button" onClick={convert} disabled={!previewUrl || loading}
            className="flex-1 py-2 rounded-lg bg-rose-500 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >{loading ? 'Converting…' : 'Generate pattern'}</button>
        </div>
      </div>
    </div>
  );
}
