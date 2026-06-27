'use client';
import { useState, useRef, useEffect } from 'react';

interface Props {
  open: boolean;
  defaultName?: string;
  onSave: (name: string) => Promise<string>; // returns shareable URL
  onClose: () => void;
}

export default function SavePatternDialog({ open, defaultName = '', onSave, onClose }: Props) {
  const [name, setName]       = useState(defaultName);
  const [saving, setSaving]   = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [copied, setCopied]   = useState(false);
  const [error, setError]     = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setName(defaultName); setSavedUrl(null); setCopied(false); setError(''); }
  }, [open, defaultName]);

  useEffect(() => {
    if (open && !savedUrl) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, savedUrl]);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const url = await onSave(name.trim() || 'Untitled');
      setSavedUrl(url);
    } catch (e) {
      if ((e as { silent?: boolean })?.silent) return;
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    if (!savedUrl) return;
    await navigator.clipboard.writeText(savedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-[420px]" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">
            {savedUrl ? 'Pattern saved!' : 'Save pattern'}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
        </div>

        {!savedUrl ? (
          <>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pattern name</label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="Untitled"
              maxLength={80}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="flex-1 py-2 rounded-lg bg-rose-500 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
              >{saving ? 'Saving…' : 'Save & get link'}</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-2">
              This link opens your pattern in the converter. Only you can access it.
            </p>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                readOnly
                value={savedUrl}
                className="flex-1 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 focus:outline-none"
                onClick={e => (e.target as HTMLInputElement).select()}
              />
              <button type="button" onClick={handleCopy}
                className={`px-3 py-2 rounded text-xs font-medium transition-colors ${
                  copied ? 'bg-green-500 text-white' : 'bg-rose-500 text-white hover:bg-rose-600'
                }`}
              >{copied ? '✓ Copied' : 'Copy'}</button>
            </div>
            <button type="button" onClick={onClose}
              className="w-full py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
            >Close</button>
          </>
        )}
      </div>
    </div>
  );
}
