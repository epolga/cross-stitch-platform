'use client';

import { useState } from 'react';
import type { Importance } from '@/lib/feature-requests';

interface Context {
  patternWidth?: number;
  patternHeight?: number;
  colorsCount?: number;
  editorTimeSeconds?: number;
  userChangedStitchesCount?: number;
  exportedPdf?: boolean;
}

interface Props {
  open: boolean;
  context: Context;
  onClose: () => void;
  onSubmit?: (importance: string) => void;
}

const IMPORTANCE_OPTIONS: { value: Importance; label: string }[] = [
  { value: 'nice-to-have', label: 'Nice to have' },
  { value: 'important',    label: 'Important' },
  { value: 'need-this',    label: 'I really need this' },
];

export default function FeatureRequestDialog({ open, context, onClose, onSubmit }: Props) {
  const [text, setText] = useState('');
  const [importance, setImportance] = useState<Importance>('nice-to-have');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleClose = () => {
    if (submitting) return;
    setText('');
    setImportance('nice-to-have');
    setEmail('');
    setError('');
    setDone(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const resp = await fetch('/api/feature-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          importance,
          email: email.trim() || undefined,
          pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
          ...context,
        }),
      });
      const data = await resp.json() as { ok?: boolean; error?: string };
      if (!resp.ok) throw new Error(data.error ?? 'Something went wrong');
      setDone(true);
      onSubmit?.(importance);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-[480px] max-h-[90vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Help shape the editor</h2>
            <p className="text-sm text-gray-500 mt-0.5">This editor is still evolving.</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1 mt-0.5"
            aria-label="Close"
          >×</button>
        </div>

        {done ? (
          <div className="py-6 text-center">
            <span className="text-4xl">💌</span>
            <p className="mt-4 text-base font-semibold text-gray-900">Thank you!</p>
            <p className="mt-1 text-sm text-gray-500">I read every suggestion personally.</p>
            <button
              type="button"
              onClick={handleClose}
              className="mt-6 px-5 py-2 rounded-lg bg-rose-500 text-sm font-medium text-white hover:bg-rose-600 transition-colors"
            >Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                What is one thing you wish you could do here?
              </label>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="I wish I could…"
                rows={4}
                maxLength={2000}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-300 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{text.length} / 2000</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">How important is this to you?</label>
              <div className="flex flex-col gap-2">
                {IMPORTANCE_OPTIONS.map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importance"
                      value={value}
                      checked={importance === value}
                      onChange={() => setImportance(value)}
                      className="accent-rose-500"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your email <span className="font-normal text-gray-400">(optional — only if you want a reply)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >Cancel</button>
              <button
                type="submit"
                disabled={submitting || text.trim().length < 5}
                className="flex-1 py-2 rounded-lg bg-rose-500 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >{submitting ? 'Sending…' : 'Send suggestion'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
