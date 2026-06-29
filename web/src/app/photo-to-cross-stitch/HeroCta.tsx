'use client';

import { trackEvent } from '@/lib/track-event';

export default function HeroCta() {
  function handleUpload() {
    trackEvent('upload_cta_clicked', {});
    window.dispatchEvent(new CustomEvent('openImportFromPhoto'));
  }

  function handleSample() {
    trackEvent('sample_image_clicked', {});
    window.dispatchEvent(new CustomEvent('openSampleImage'));
  }

  return (
    <div className="mb-8 flex flex-col items-center gap-4 rounded-2xl bg-rose-50 border border-rose-100 px-6 py-10">
      <span className="text-5xl leading-none">📷</span>
      <p className="text-xl font-semibold text-gray-800 text-center">
        Upload a photo — I&apos;ll turn it into a cross-stitch pattern.
      </p>
      <button
        type="button"
        onClick={handleUpload}
        className="rounded-xl bg-rose-500 px-10 py-3 text-base font-semibold text-white shadow hover:bg-rose-600 active:bg-rose-700 transition-colors"
      >
        Upload Your Photo
      </button>
      <button
        type="button"
        onClick={handleSample}
        className="text-sm text-rose-500 hover:text-rose-700 underline underline-offset-2 transition-colors"
      >
        Try a Sample Image
      </button>
      <p className="text-xs text-gray-400">Supports JPG, PNG, and WebP · No software to install</p>
    </div>
  );
}
