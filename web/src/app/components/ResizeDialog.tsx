'use client';
import { useState, useEffect } from 'react';

export type ResizeMode = 'canvas' | 'scale';
export type ResizeAnchor = 'top-left' | 'center';

interface Props {
  open: boolean;
  currentW: number;
  currentH: number;
  onConfirm: (newW: number, newH: number, mode: ResizeMode, anchor: ResizeAnchor) => void;
  onClose: () => void;
}

export default function ResizeDialog({ open, currentW, currentH, onConfirm, onClose }: Props) {
  const [w, setW] = useState(currentW);
  const [h, setH] = useState(currentH);
  const [mode, setMode] = useState<ResizeMode>('canvas');
  const [anchor, setAnchor] = useState<ResizeAnchor>('top-left');
  const [lock, setLock] = useState(false);

  useEffect(() => {
    if (open) { setW(currentW); setH(currentH); }
  }, [open, currentW, currentH]);

  if (!open) return null;

  const ratio = currentW / currentH;

  function changeW(val: number) {
    const v = Math.max(10, Math.min(500, val || 10));
    setW(v);
    if (lock) setH(Math.max(10, Math.min(500, Math.round(v / ratio))));
  }
  function changeH(val: number) {
    const v = Math.max(10, Math.min(500, val || 10));
    setH(v);
    if (lock) setW(Math.max(10, Math.min(500, Math.round(v * ratio))));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-80" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-900 mb-4">Resize Pattern</h3>

        {/* Dimensions */}
        <div className="flex items-end gap-2 mb-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Width</label>
            <input type="number" min={10} max={500} value={w}
              onChange={e => changeW(parseInt(e.target.value))}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          </div>
          <button type="button" onClick={() => setLock(l => !l)}
            title={lock ? 'Unlock proportions' : 'Lock proportions'}
            className={`mb-1 text-lg px-1 transition-opacity ${lock ? 'opacity-100' : 'opacity-30'}`}
          >
            {lock ? '🔗' : '🔓'}
          </button>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Height</label>
            <input type="number" min={10} max={500} value={h}
              onChange={e => changeH(parseInt(e.target.value))}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          </div>
        </div>

        {/* Mode */}
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-600 mb-1">Mode</p>
          <div className="flex gap-2">
            {(['canvas', 'scale'] as ResizeMode[]).map(m => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`flex-1 py-1.5 rounded border text-xs font-medium transition-colors ${
                  mode === m ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-gray-700 border-gray-300 hover:border-rose-300'
                }`}
              >
                {m === 'canvas' ? 'Resize canvas' : 'Scale content'}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {mode === 'canvas'
              ? 'Keep content as-is — pad or crop edges'
              : 'Stretch or shrink the pattern to fit the new size'}
          </p>
        </div>

        {/* Anchor — only for canvas mode */}
        {mode === 'canvas' && (
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-600 mb-1">Anchor</p>
            <div className="flex gap-2">
              {(['top-left', 'center'] as ResizeAnchor[]).map(a => (
                <button key={a} type="button" onClick={() => setAnchor(a)}
                  className={`flex-1 py-1.5 rounded border text-xs font-medium transition-colors ${
                    anchor === a ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                  }`}
                >
                  {a === 'top-left' ? 'Top-left' : 'Center'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button type="button" onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm(w, h, mode, anchor)}
            className="flex-1 py-2 rounded-lg bg-rose-500 text-sm font-medium text-white hover:bg-rose-600"
          >
            Resize
          </button>
        </div>
      </div>
    </div>
  );
}
