'use client';

import { useEffect, useState } from 'react';

export default function BlogReaction({ slug }: { slug: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [reacted, setReacted] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/blog/${slug}/react`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setCount(data.count); })
      .catch(() => {});
  }, [slug]);

  function react() {
    if (reacted || sending) return;
    setSending(true);
    fetch(`/api/blog/${slug}/react`, { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setCount(data.count);
        setReacted(true);
      })
      .catch(() => {})
      .finally(() => setSending(false));
  }

  return (
    <div className="flex items-center gap-3 mt-8 pt-6 border-t border-gray-200">
      <button
        type="button"
        onClick={react}
        disabled={reacted || sending}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
          reacted
            ? 'bg-rose-100 text-rose-600 cursor-default'
            : 'bg-gray-100 text-gray-700 hover:bg-rose-50 hover:text-rose-600'
        }`}
      >
        <span>🧵</span>
        <span>{reacted ? 'Thanks!' : 'This resonates with me'}</span>
      </button>
      {count !== null && (
        <span className="text-sm text-gray-500">
          {count} {count === 1 ? 'person' : 'people'} felt this too
        </span>
      )}
    </div>
  );
}
