'use client';

import { useMemo, useState } from 'react';
import { stitchesToSize } from '@/lib/fabric-size';

const COMMON_COUNTS = [11, 14, 16, 18, 20, 22, 25, 28, 32];

export default function SizeCalculatorClient() {
  const [width, setWidth] = useState(100);
  const [height, setHeight] = useState(100);
  const [count, setCount] = useState(14);

  const size = useMemo(() => {
    const w = stitchesToSize(width, count);
    const h = stitchesToSize(height, count);
    return { w, h };
  }, [width, height, count]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <label className="block">
          <span className="text-xs font-semibold text-gray-700">Width (stitches)</span>
          <input
            type="number"
            min={1}
            value={width}
            onChange={(e) => setWidth(Math.max(1, Number(e.target.value) || 0))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-700">Height (stitches)</span>
          <input
            type="number"
            min={1}
            value={height}
            onChange={(e) => setHeight(Math.max(1, Number(e.target.value) || 0))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-700">Fabric count</span>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
          >
            {COMMON_COUNTS.map((c) => (
              <option key={c} value={c}>
                {c}-count Aida
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="bg-rose-50 border border-rose-100 rounded-lg p-4 text-center">
        <p className="text-xs text-rose-700 font-semibold uppercase tracking-wide mb-1">Finished size</p>
        <p className="text-2xl font-bold text-gray-900">
          {size.w.cm.toFixed(1)} × {size.h.cm.toFixed(1)} cm
        </p>
        <p className="text-sm text-gray-500 mt-0.5">
          ({size.w.inches.toFixed(1)}″ × {size.h.inches.toFixed(1)}″)
        </p>
      </div>

      <p className="text-xs text-gray-400 mt-4 text-center">
        Cut your fabric at least 5&nbsp;cm (2″) larger on each side than the finished size — you&apos;ll need
        that border for hooping and framing. Formula: stitches ÷ fabric count = size in inches.
      </p>
    </div>
  );
}
