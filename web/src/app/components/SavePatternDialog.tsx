'use client';
import { useState, useRef, useEffect } from 'react';

interface Props {
  open: boolean;
  defaultName?: string;
  onSave: (name: string) => Promise<string>; // returns shareable URL
  onSaved?: (url: string) => void;
  onClose: () => void;
}

export default function SavePatternDialog({ open, defaultName = '', onSave, onSaved, onClose }: Props) {
  const [name, setName]     = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setName(defaultName); setError(''); }
  }, [open, defaultName]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const url = await onSave(name.trim() || 'Untitled');
      onSaved?.(url);
      onClose();
    } catch (e) {
      if ((e as { silent?: boolean })?.silent) return;
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-[420px]" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Save pattern</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
        </div>

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
          >{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
