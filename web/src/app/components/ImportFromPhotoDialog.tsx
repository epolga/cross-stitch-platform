'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import type { ConvertedPattern } from '@/lib/pattern-converter';
import type { ImageAnalysis } from '@/lib/image-analysis';

import { trackEvent } from '@/lib/track-event';
import type { ColorDistanceMode } from '@/lib/pattern-converter';

const COLOR_OPTIONS_PHOTO = [5, 10, 20, 30, 40, 50, 100] as const;
const COLOR_OPTIONS_LINEART = [2, 3, 4, 5, 10, 20] as const;

type UserMode = 'auto' | 'photo' | 'illustration' | 'line-art';

// Focus.md Open item #11 — plain-language labels for the underlying
// CIE76/CIEDE2000 color-distance formulas (see pattern-converter.ts), so
// visitors pick by what it means for them, not the color-science jargon.
const DISTANCE_MODE_LABELS: Record<ColorDistanceMode, string> = {
  cie76: 'Standard',
  'final-only': 'Better Color Match',
  everywhere: 'Best Color Match (slower)',
};

const TYPE_LABELS: Record<string, { icon: string; label: string }> = {
  photo:        { icon: '📷', label: 'Photo' },
  'line-art':   { icon: '✒', label: 'Line Art' },
  typography:   { icon: '🔤', label: 'Typography' },
  illustration: { icon: '🎨', label: 'Illustration' },
};

interface Props {
  open: boolean;
  initialFile?: File | null;
  onClose: () => void;
  onImport: (data: ConvertedPattern, paddedGrid: number[][]) => void;
  // Called right after a successful conversion, alongside onImport — hands
  // the parent the exact File plus the two consent flags (see the comment
  // at the call site) so it can defer the actual S3 upload to Save time
  // instead of uploading on every conversion attempt.
  onFileReady?: (file: File, consent: { keepForReuse: boolean; researchConsent: boolean }) => void;
  // Called when the photo is explicitly cleared (Load New, or Cancel before
  // any design exists) — lets the parent forget initialFile too, so a
  // cleared photo can't resurrect itself the next time this dialog opens.
  onRemoveFile?: () => void;
  // Whether the editor already has a design. Drives both the main button's
  // label (Generate vs Redo) and whether Cancel/× is destructive: with no
  // design yet, canceling clears the picked photo (nothing to preserve);
  // once a design exists, this photo IS that design's source — Cancel just
  // closes and leaves it in place, only "Load New" replaces it.
  hasExistingDesign?: boolean;
  // Bumped by the parent (e.g. newPattern()) to force this dialog to
  // forget its currently-selected file/preview, even while the dialog
  // itself stays mounted (it's always rendered — open just toggles
  // visibility — so its own selectedFile ref/previewUrl otherwise persist
  // for the whole page session with no signal that the design they
  // belonged to was discarded). Any change in value triggers a clear;
  // the actual number is meaningless.
  resetSignal?: number;
}

export default function ImportFromPhotoDialog({ open, initialFile, onClose, onImport, onFileReady, onRemoveFile, hasExistingDesign, resetSignal }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [patWidth, setPatWidth] = useState(100);
  const [patHeight, setPatHeight] = useState(100);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [lockAspect, setLockAspect] = useState(true);
  const [numColors, setNumColors] = useState<2 | 3 | 4 | 5 | 10 | 20 | 30 | 40 | 50 | 100>(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [userMode, setUserMode] = useState<UserMode>('auto');
  const [colorDistanceMode, setColorDistanceMode] = useState<ColorDistanceMode>('cie76');
  // Off (both the flag fetch and the checkbox default) until Olga confirms
  // the consent wording is GDPR-compliant — see research-consent.ts.
  const [researchCollectionEnabled, setResearchCollectionEnabled] = useState(false);
  const [researchConsent, setResearchConsent] = useState(false);
  // 2026-08-11 (Olga's ask): a separate, honest checkbox from the research
  // one above — this one is "keep my own photo so I can redo this later,"
  // not research use, and isn't gated by isResearchImageCollectionEnabled()
  // or its pending GDPR review (that review is about the research case
  // specifically). Defaults on — Olga's call: most people want this.
  const [keepForReuse, setKeepForReuse] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const selectedFile = useRef<File | null>(null);

  useEffect(() => {
    fetch('/api/config/research-collection')
      .then(r => r.json())
      .then((d: { enabled?: boolean }) => setResearchCollectionEnabled(Boolean(d.enabled)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open && initialFile) handleFile(initialFile);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  // See the resetSignal prop comment — lets the parent force-clear the
  // currently-selected file even though this dialog stays mounted for the
  // whole page session. Skips the very first render (a ref, initialized to
  // the same value the prop starts at, so mount never counts as "changed").
  const resetSignalSeen = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal === undefined || resetSignal === resetSignalSeen.current) return;
    resetSignalSeen.current = resetSignal;
    removeFile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  // When analysis arrives with a suggested minimum width, auto-update the inputs.
  useEffect(() => {
    if (!analysis?.suggestedMinWidth) return;
    if (patWidth >= analysis.suggestedMinWidth) return;
    const newW = analysis.suggestedMinWidth;
    setPatWidth(newW);
    if (lockAspect && aspectRatio) setPatHeight(Math.round(newW / aspectRatio));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis]);

  // Sync color count to the active mode's option list.
  // line-art → 3 (outline + background + one shade)
  // photo/illustration → reset to 10 only if current value isn't in that list (e.g. came from line-art)
  useEffect(() => {
    if (effectiveMode() === 'line-art') {
      setNumColors(3);
    } else {
      const valid = new Set<number>(COLOR_OPTIONS_PHOTO);
      if (!valid.has(numColors)) setNumColors(30);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userMode, analysis]);

  async function analyzeFile(file: File) {
    setAnalysis(null);
    setAnalyzing(true);
    try {
      const form = new FormData();
      form.append('image', file);
      const resp = await fetch('/api/analyze', { method: 'POST', body: form });
      if (resp.ok) setAnalysis(await resp.json());
    } catch {
      // Non-critical — analysis failure doesn't block conversion
    } finally {
      setAnalyzing(false);
    }
  }

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Please upload an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image too large — max 5 MB.'); return; }
    selectedFile.current = file;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setError('');
    setAnalysis(null);
    setPatWidth(100);
    setPatHeight(100);
    const img = document.createElement('img');
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      setAspectRatio(ratio);
      if (lockAspect) setPatHeight(Math.round(100 / ratio));
    };
    img.src = url;
    void analyzeFile(file);
  }

  function removeFile() {
    setPreviewUrl(null);
    setAnalysis(null);
    setAnalyzing(false);
    selectedFile.current = null;
    if (fileRef.current) fileRef.current.value = '';
    onRemoveFile?.();
  }

  // The "Load New" button: clears the current photo AND immediately opens
  // the file picker — unlike a bare removeFile(), this one is an explicit
  // "replace it" action, so there's no reason to make the user click the
  // (now-empty) dropzone as a separate second step.
  function loadNew() {
    removeFile();
    fileRef.current?.click();
  }

  // Cancel/× only clears the photo when there's no design yet to keep it
  // "as" — once a design exists, this photo is that design's current
  // source, so canceling just closes without touching it. Load New is the
  // only way to replace it at that point.
  function handleCancel() {
    if (!hasExistingDesign) removeFile();
    onClose();
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effective mode: if user chose 'auto', use detected type; otherwise use user choice.
  function effectiveMode(): UserMode {
    if (userMode !== 'auto') return userMode;
    if (!analysis) return 'photo';
    if (analysis.type === 'line-art' || analysis.type === 'typography') return 'line-art';
    if (analysis.type === 'illustration') return 'illustration';
    return 'photo';
  }

  // Warnings to show: only when mode is auto and analysis detected a non-photo type.
  const activeWarnings: string[] =
    userMode === 'auto' && analysis ? analysis.warnings : [];

  // Size warning: if analysis suggests a larger min width and user's width is small.
  const sizeWarning: string | null =
    analysis?.suggestedMinWidth != null &&
    patWidth < analysis.suggestedMinWidth
      ? `Consider at least ${analysis.suggestedMinWidth} stitches wide for this image type.`
      : null;

  async function convert() {
    const file = selectedFile.current;
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      let innerW = patWidth, innerH = patHeight;
      if (aspectRatio) {
        const fitH = Math.round(patWidth / aspectRatio);
        if (fitH <= patHeight) { innerH = Math.max(10, fitH); }
        else { innerW = Math.max(10, Math.round(patHeight * aspectRatio)); innerH = patHeight; }
      }
      const mode = userMode === 'auto' ? 'auto' : userMode;
      const form = new FormData();
      form.append('image', file);
      form.append('width', String(innerW));
      form.append('height', String(innerH));
      form.append('colors', String(numColors));
      form.append('mode', mode);
      form.append('colorDistanceMode', colorDistanceMode);
      trackEvent('pattern_generation_started', {
        width: innerW,
        height: innerH,
        colorCount: numColors,
        fileType: file.type,
        conversionMode: mode,
        detectedType: analysis?.type,
      });
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

      // Deliberately does NOT clear previewUrl/selectedFile — this photo is
      // now the current design's source. Reopening the dialog shows it
      // again (ready for Redo with different settings); Load New is the
      // explicit action to replace it.
      //
      // The actual S3 upload (sourceImageKey/researchImageKey) no longer
      // happens here (see api/convert/route.ts) — hand the file + consent
      // flags to the parent so it can upload only if/when the owner
      // actually saves (upload-source-photo/route.ts), not on every
      // conversion attempt.
      onFileReady?.(file, {
        keepForReuse,
        researchConsent: researchCollectionEnabled && researchConsent,
      });
      onImport(data, paddedGrid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversion failed');
      trackEvent('editor_error', { errorCode: 'conversion_failed', step: 'pattern_generation' });
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const detectedLabel = analysis ? TYPE_LABELS[analysis.type] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleCancel}>
      <div className="bg-white rounded-xl shadow-xl p-5 w-[480px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-0.5">
          <h3 className="text-base font-semibold text-gray-900">Import from Photo</h3>
          <button type="button" onClick={handleCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
        </div>
        <p className="text-xs text-gray-500 mb-2">Upload any photo and I&apos;ll convert it into a stitchable cross-stitch pattern using real DMC thread colors.</p>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors p-3 mb-2
            ${dragOver ? 'border-rose-400 bg-rose-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
        >
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          {previewUrl ? (
            <div className="relative w-20 h-20">
              <Image src={previewUrl} alt="Selected" fill className="object-contain rounded" unoptimized />
            </div>
          ) : (
            <>
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-gray-500">Drag & drop or <span className="text-rose-600 font-medium">click to upload</span></p>
              <p className="text-xs text-gray-400">JPEG, PNG, WebP — max 5 MB</p>
            </>
          )}
        </div>

        {/* Type badge row */}
        {previewUrl && (analyzing || detectedLabel) && (
          <div className="flex items-center gap-2 mb-3">
            {analyzing && (
              <span className="text-xs text-gray-400">Analysing…</span>
            )}
            {!analyzing && detectedLabel && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-600">
                {detectedLabel.icon} {detectedLabel.label}
                {analysis?.confidence === 'high' && (
                  <span className="text-gray-400 text-[10px]">detected</span>
                )}
              </span>
            )}
          </div>
        )}

        {/* Warnings */}
        {activeWarnings.length > 0 && (
          <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
            {activeWarnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-800 leading-relaxed">
                {i === 0 ? '⚠ ' : ''}{w}
              </p>
            ))}
          </div>
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

        <p className="text-xs text-gray-400 mb-1">
          50–80 stitches wide is a good beginner size. 🔗 locks the aspect ratio.
        </p>

        {sizeWarning && (
          <p className="text-xs text-amber-700 mb-2">⚠ {sizeWarning}</p>
        )}

        {/* Colors */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">How many thread colors?</label>
          <div className="flex flex-wrap gap-2">
            {(effectiveMode() === 'line-art' ? COLOR_OPTIONS_LINEART : COLOR_OPTIONS_PHOTO).map(n => (
              <button key={n} type="button" onClick={() => setNumColors(n as typeof numColors)}
                title={n <= 2 ? 'Black & white only' : n <= 3 ? 'Minimal — outlines + one shade' : n <= 5 ? 'Simple, great for line art' : n <= 10 ? 'Good balance of detail and simplicity' : n <= 20 ? 'More detailed' : 'Rich in colour detail'}
                className={`px-3 py-1.5 rounded border text-sm font-medium transition-colors
                  ${numColors === n ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-gray-700 border-gray-300 hover:border-rose-300'}`}
              >{n}</button>
            ))}
          </div>
        </div>

        {/* Processing mode */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Processing mode</label>
          <div className="flex gap-2">
            {(['auto', 'photo', 'illustration', 'line-art'] as UserMode[]).map(m => {
              const labels: Record<UserMode, string> = {
                auto: analysis ? `Auto (${TYPE_LABELS[analysis.type]?.label ?? 'Photo'})` : 'Auto',
                photo: 'Photo',
                illustration: 'Illustration',
                'line-art': 'Line Art',
              };
              const active = userMode === m;
              const isEffective = m !== 'auto' && userMode === 'auto' && effectiveMode() === m;
              return (
                <button key={m} type="button" onClick={() => setUserMode(m)}
                  title={
                    m === 'auto' ? 'Let the editor detect the best mode automatically' :
                    m === 'photo' ? 'Optimised for photographs — preserves colour gradients' :
                    m === 'illustration' ? 'Optimised for flat illustrations and cartoons — preserves distinct colour regions' :
                    'Optimised for line art, sketches, and text — preserves sharp edges'
                  }
                  className={`flex-1 px-2 py-1.5 rounded border text-xs font-medium transition-colors
                    ${active
                      ? 'bg-rose-500 text-white border-rose-500'
                      : isEffective
                      ? 'bg-rose-50 text-rose-700 border-rose-300'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
                >{labels[m]}</button>
              );
            })}
          </div>
        </div>

        <div className="mb-2">
          <label className="block text-xs font-medium text-gray-600 mb-0.5">Thread color accuracy</label>
          <select
            value={colorDistanceMode}
            onChange={e => setColorDistanceMode(e.target.value as ColorDistanceMode)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-700"
          >
            {(Object.keys(DISTANCE_MODE_LABELS) as ColorDistanceMode[]).map(m => (
              <option key={m} value={m}>{DISTANCE_MODE_LABELS[m]}</option>
            ))}
          </select>
        </div>

        <label className="flex items-start gap-2 mb-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={keepForReuse}
            onChange={e => setKeepForReuse(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-xs text-gray-500">
            Keep my photo so I can redo this conversion later without re-uploading.
          </span>
        </label>

        {researchCollectionEnabled && (
          <label className="flex items-start gap-2 mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={researchConsent}
              onChange={e => setResearchConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs text-gray-500">
              Also allow us to use this photo for research, to help improve the converter. See{' '}
              <a href="/privacy-policy" target="_blank" rel="noreferrer" className="text-rose-600 underline hover:text-rose-700">
                Privacy Policy
              </a>.
            </span>
          </label>
        )}

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={loadNew} disabled={!previewUrl}
            title={previewUrl ? 'Remove this photo and pick a different one' : 'No photo loaded yet'}
            className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:text-gray-400"
          >Load New</button>
          <button type="button" onClick={handleCancel}
            className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >Cancel</button>
          {hasExistingDesign && !previewUrl ? (
            // A design exists but this session has no photo tied to it (e.g.
            // after Resuming a draft — drafts don't carry the source photo,
            // since File objects can't be saved to localStorage). Nothing to
            // (re)generate — this just gets out of the way.
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg bg-rose-500 text-sm font-medium text-white hover:bg-rose-600 transition-colors"
            >Continue</button>
          ) : (
            <button type="button" onClick={convert} disabled={!previewUrl || loading}
              className="flex-1 py-2 rounded-lg bg-rose-500 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >{loading ? (hasExistingDesign ? 'Redoing…' : 'Converting…') : (hasExistingDesign ? 'Redo' : 'Generate pattern')}</button>
          )}
        </div>
      </div>
    </div>
  );
}
