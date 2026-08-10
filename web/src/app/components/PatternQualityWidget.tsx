'use client';

import { useState } from 'react';

type Rating = 'yes' | 'mostly' | 'no';

interface Props {
  open: boolean;
  onSubmit: (rating: Rating, reason?: string) => void;
  onClose: () => void;
}

const REASONS = [
  'Colors don’t match the photo',
  'Too much detail was lost',
  'Pattern size is wrong',
  'Something else',
];

const RATINGS: { value: Rating; label: string; emoji: string }[] = [
  { value: 'yes',    label: 'Yes',    emoji: '😍' },
  { value: 'mostly', label: 'Mostly', emoji: '🙂' },
  { value: 'no',     label: 'No',     emoji: '😕' },
];

// Non-blocking corner card (no backdrop) so it never interrupts editing —
// distinct from FeatureRequestDialog, which is an intentional full modal.
//
// 2026-08-10: z-50, not z-40. ConvertClient's fullscreen editor section is
// `fixed inset-0 z-40` — the exact same z-index this widget used to have —
// so if the widget ever armed while fullscreen was on, it would render but
// sit visually buried under the opaque fullscreen panel. This is a real
// latent bug, fixed here regardless. NOT confirmed as the cause of the
// 2026-08-10 Sparrow incident specifically — she was not in fullscreen
// mode that time — so that report is still open; don't treat this fix as
// having closed it.
export default function PatternQualityWidget({ open, onSubmit, onClose }: Props) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);

  if (!open) return null;

  function pick(value: Rating) {
    setRating(value);
    if (value !== 'no') {
      onSubmit(value);
      setDone(true);
      setTimeout(onClose, 1800);
    }
  }

  function submitReason() {
    onSubmit('no', reason || undefined);
    setDone(true);
    setTimeout(onClose, 1800);
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-72 rounded-xl bg-white border border-gray-200 shadow-xl p-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 leading-none"
        aria-label="Dismiss"
      >✕</button>

      {done ? (
        <p className="text-sm text-gray-700 py-2">Thanks for the feedback! 💛</p>
      ) : rating === 'no' ? (
        <>
          <p className="text-sm font-semibold text-gray-900 mb-2 pr-4">What went wrong?</p>
          <div className="flex flex-col gap-1.5 mb-3">
            {REASONS.map(r => (
              <label key={r} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input
                  type="radio"
                  name="quality-reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="accent-rose-500"
                />
                {r}
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={submitReason}
            disabled={!reason}
            className="w-full py-1.5 rounded-lg bg-rose-500 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >Send</button>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-gray-900 mb-3 pr-4">Are you happy with this pattern?</p>
          <div className="flex gap-2">
            {RATINGS.map(({ value, label, emoji }) => (
              <button
                key={value}
                type="button"
                onClick={() => pick(value)}
                className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border border-gray-200 hover:border-rose-300 hover:bg-rose-50 transition-colors"
              >
                <span className="text-lg">{emoji}</span>
                <span className="text-xs text-gray-600">{label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
