'use client';

import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import PatternCanvas from '@/app/components/PatternCanvas';
import type { ConvertedPattern } from '@/lib/pattern-converter';

const COLOR_OPTIONS = [10, 15, 20, 25] as const;

export default function ConvertPage() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [width, setWidth] = useState(80);
  const [height, setHeight] = useState(80);
  const [colors, setColors] = useState<10 | 15 | 20 | 25>(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pattern, setPattern] = useState<ConvertedPattern | null>(null);
  const [viewMode, setViewMode] = useState<'color' | 'symbol'>('color');
  const [dragOver, setDragOver] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const selectedFile = useRef<File | null>(null);

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Please upload an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image too large — max 5 MB.'); return; }
    selectedFile.current = file;
    setPreviewUrl(URL.createObjectURL(file));
    setPattern(null);
    setError('');
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
    setPattern(null);
    try {
      const form = new FormData();
      form.append('image', selectedFile.current);
      form.append('width', String(width));
      form.append('height', String(height));
      form.append('colors', String(colors));
      const resp = await fetch('/api/convert', { method: 'POST', body: form });
      if (!resp.ok) {
        const { error: msg } = await resp.json().catch(() => ({ error: 'Conversion failed' }));
        throw new Error(msg);
      }
      const data = await resp.json() as ConvertedPattern;
      setPattern(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversion failed');
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    if (!pattern) return;
    setDownloading(true);
    try {
      const resp = await fetch('/api/convert/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grid: pattern.grid, palette: pattern.palette }),
      });
      if (!resp.ok) throw new Error('PDF generation failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cross-stitch-pattern.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
          {/* Step 1: Upload */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">1. Upload your photo</h2>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors p-8
                ${dragOver ? 'border-rose-400 bg-rose-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {previewUrl ? (
                <div className="relative w-48 h-48">
                  <Image src={previewUrl} alt="Selected photo" fill className="object-contain rounded" unoptimized />
                </div>
              ) : (
                <>
                  <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-500">Drag and drop or <span className="text-rose-600 font-medium">click to upload</span></p>
                  <p className="text-xs text-gray-400">JPEG, PNG, WebP — max 5 MB</p>
                </>
              )}
            </div>
            {previewUrl && (
              <button
                type="button"
                onClick={() => { setPreviewUrl(null); selectedFile.current = null; setPattern(null); if (fileRef.current) fileRef.current.value = ''; }}
                className="mt-2 text-xs text-gray-400 hover:text-gray-600"
              >
                Remove photo
              </button>
            )}
          </section>

          {/* Step 2: Options */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">2. Choose pattern size and colors</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Width (stitches)</label>
                <input
                  type="number"
                  min={10} max={500}
                  value={width}
                  onChange={(e) => setWidth(Math.max(10, Math.min(500, parseInt(e.target.value) || 10)))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Height (stitches)</label>
                <input
                  type="number"
                  min={10} max={500}
                  value={height}
                  onChange={(e) => setHeight(Math.max(10, Math.min(500, parseInt(e.target.value) || 10)))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">DMC colors</label>
                <div className="flex gap-2">
                  {COLOR_OPTIONS.map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setColors(n)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors
                        ${colors === n
                          ? 'bg-rose-500 text-white border-rose-500'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-rose-300'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={convert}
              disabled={!previewUrl || loading}
              className="mt-6 w-full rounded-lg bg-rose-500 py-3 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Converting…' : 'Generate pattern'}
            </button>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </section>

          {/* Step 3: Preview */}
          {pattern && (
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">3. Pattern preview</h2>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                    <button
                      type="button"
                      onClick={() => setViewMode('color')}
                      className={`px-3 py-1 text-sm rounded-md transition-colors ${viewMode === 'color' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      Color
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('symbol')}
                      className={`px-3 py-1 text-sm rounded-md transition-colors ${viewMode === 'symbol' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      Symbol
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={downloadPdf}
                    disabled={downloading}
                    className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
                  >
                    {downloading ? 'Generating…' : 'Download PDF'}
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-400 mb-3">
                {pattern.width} × {pattern.height} stitches · {pattern.palette.length} DMC colors
              </p>

              <div className="overflow-auto border border-gray-100 rounded-lg">
                <PatternCanvas grid={pattern.grid} palette={pattern.palette} mode={viewMode} />
              </div>

              {/* Color key */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Color key</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {pattern.palette.map((c) => (
                    <div key={c.number} className="flex items-center gap-2 text-xs">
                      <div
                        className="w-5 h-5 rounded border border-gray-300 flex-none flex items-center justify-center text-xs font-mono"
                        style={{ backgroundColor: `rgb(${c.r},${c.g},${c.b})`, color: c.r + c.g + c.b > 380 ? '#000' : '#fff' }}
                      >
                        {c.symbol}
                      </div>
                      <span className="text-gray-700 truncate">
                        <span className="font-medium">DMC {c.number}</span>
                        {' '}<span className="text-gray-400">{c.name}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
    </div>
  );
}
