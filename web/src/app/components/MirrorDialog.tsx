'use client';
import { useState } from 'react';

export type MirrorDirection = 'right' | 'left' | 'top' | 'bottom';
export type MirrorAxis = 'edge' | 'center';
export type MirrorResize = 'expand' | 'crop';

interface Props {
  direction: MirrorDirection;
  onConfirm: (axis: MirrorAxis, resize: MirrorResize) => void;
  onCancel: () => void;
}

const DIR_LABEL: Record<MirrorDirection, string> = {
  right: 'Right', left: 'Left', top: 'Top', bottom: 'Bottom',
};

export default function MirrorDialog({ direction, onConfirm, onCancel }: Props) {
  const [axis, setAxis] = useState<MirrorAxis>('edge');
  const [resize, setResize] = useState<MirrorResize>('expand');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl w-72" onClick={e => e.stopPropagation()}>
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Mirror {DIR_LABEL[direction]}</h3>
          <button type="button" onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Axis of Symmetry */}
          <fieldset className="border border-gray-300 rounded-lg px-3 pt-1 pb-3">
            <legend className="text-xs font-medium text-gray-600 px-1">Axis of Symmetry</legend>
            <div className="space-y-2 mt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="axis" checked={axis === 'edge'} onChange={() => setAxis('edge')}
                  className="accent-rose-500" />
                <span className="text-sm text-gray-700">Mirror from edge of cell</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="axis" checked={axis === 'center'} onChange={() => setAxis('center')}
                  className="accent-rose-500" />
                <span className="text-sm text-gray-700">Mirror from center of cell</span>
              </label>
            </div>
          </fieldset>

          {/* Resize Chart */}
          <fieldset className="border border-gray-300 rounded-lg px-3 pt-1 pb-3">
            <legend className="text-xs font-medium text-gray-600 px-1">Resize Chart</legend>
            <div className="space-y-2 mt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="resize" checked={resize === 'expand'} onChange={() => setResize('expand')}
                  className="accent-rose-500" />
                <span className="text-sm text-gray-700">Expand chart size if needed</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="resize" checked={resize === 'crop'} onChange={() => setResize('crop')}
                  className="accent-rose-500" />
                <span className="text-sm text-gray-700">Crop to present chart size</span>
              </label>
            </div>
          </fieldset>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 px-4 pb-4">
          <button type="button" onClick={onCancel}
            className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm(axis, resize)}
            className="flex-1 py-2 rounded-lg bg-rose-500 text-sm font-medium text-white hover:bg-rose-600">
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
