'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isUserLoggedIn } from '@/app/components/AuthControl';
import { resolveThumbnailSrc } from '@/lib/pattern-thumbnail-url';

interface PatternSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  createdAt: string;
  modifiedAt: string;
  thumbnail?: string;
}

function readCurrentFirstName(): string {
  if (typeof window === 'undefined') return '';
  return (localStorage.getItem('userFirstName') || '').trim();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ProfilePatternsPageClient() {
  const router = useRouter();
  const [hasResolvedAuth, setHasResolvedAuth] = useState(false);
  const [hadPrivateAccess, setHadPrivateAccess] = useState(false);
  const [isLoggedInState, setIsLoggedInState] = useState(false);
  const [currentFirstName, setCurrentFirstName] = useState('');
  const [patterns, setPatterns] = useState<PatternSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  async function handleDelete(id: string) {
    setDeletingId(id);
    setDeleteError('');
    try {
      const res = await fetch(`/api/converter/patterns/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete');
      setPatterns(prev => prev.filter(p => p.id !== id));
      setConfirmDeleteId(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    const syncAuthState = () => {
      setIsLoggedInState(isUserLoggedIn());
      setCurrentFirstName(readCurrentFirstName());
      setHasResolvedAuth(true);
    };
    syncAuthState();
    window.addEventListener('authStateChange', syncAuthState as EventListener);
    window.addEventListener('storage', syncAuthState);
    return () => {
      window.removeEventListener('authStateChange', syncAuthState as EventListener);
      window.removeEventListener('storage', syncAuthState);
    };
  }, []);

  useEffect(() => {
    if (!hasResolvedAuth) return;
    if (isLoggedInState) { setHadPrivateAccess(true); return; }
    router.replace(hadPrivateAccess ? '/?from=profile-logout' : '/');
  }, [hasResolvedAuth, isLoggedInState, hadPrivateAccess, router]);

  useEffect(() => {
    if (!hasResolvedAuth || !isLoggedInState) return;

    let mounted = true;
    setIsLoading(true);
    setErrorMessage('');

    fetch('/api/converter/patterns/my', { cache: 'no-store' })
      .then(async res => {
        const data = await res.json() as { patterns?: PatternSummary[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Failed to load');
        if (mounted) setPatterns(data.patterns ?? []);
      })
      .catch(e => { if (mounted) setErrorMessage(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (mounted) setIsLoading(false); });

    return () => { mounted = false; };
  }, [hasResolvedAuth, isLoggedInState]);

  if (!hasResolvedAuth || !isLoggedInState) {
    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-5xl flex-col px-4 py-10">
        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-semibold text-gray-900">Redirecting...</h1>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-6xl flex-col px-4 py-10">
      <section className="rounded-[2rem] border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-amber-50 p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-800">
          Private profile
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-gray-900">
          {currentFirstName ? `${currentFirstName}'s saved patterns` : 'Your saved patterns'}
        </h1>
        <p className="mt-3 max-w-3xl text-base text-gray-700">
          Cross-stitch patterns you converted and saved. Only you can open them.
        </p>
        {!isLoading && (
          <div className="mt-6 inline-flex items-center rounded-full border border-rose-300 bg-white/80 px-4 py-2 text-sm font-medium text-rose-900 shadow-sm">
            {patterns.length} {patterns.length === 1 ? 'saved pattern' : 'saved patterns'}
          </div>
        )}
        <div className="mt-4">
          <Link href="/profile" className="text-sm text-rose-700 underline underline-offset-2 hover:text-rose-900">
            ← Back to profile
          </Link>
        </div>
      </section>

      {isLoading && (
        <section className="mt-8 rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <p className="text-base text-gray-600">Loading your patterns...</p>
        </section>
      )}

      {!isLoading && errorMessage && (
        <section className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-red-900">Unable to load patterns</h2>
          <p className="mt-2 text-sm text-red-700">{errorMessage}</p>
        </section>
      )}

      {!isLoading && !errorMessage && patterns.length === 0 && (
        <section className="mt-8 rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">No saved patterns yet</h2>
          <p className="mt-2 text-base text-gray-600">
            Convert a photo and save the result — it will appear here.
          </p>
          <Link
            href="/photo-to-cross-stitch"
            className="mt-6 inline-flex w-fit rounded-full bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-600"
          >
            Open converter
          </Link>
        </section>
      )}

      {!isLoading && !errorMessage && patterns.length > 0 && (
        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {patterns.map(p => (
            <article
              key={p.id}
              className="flex h-full flex-col rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="relative flex h-[120px] items-center justify-center overflow-hidden rounded-2xl bg-rose-50">
                {p.thumbnail ? (
                  <Image
                    src={resolveThumbnailSrc(p.thumbnail)!}
                    alt={`${p.name} preview`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    className="object-contain p-1"
                    unoptimized
                  />
                ) : (
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true" className="text-rose-300">
                    <rect x="6"  y="6"  width="8" height="8" rx="1" fill="currentColor" opacity="0.5"/>
                    <rect x="20" y="6"  width="8" height="8" rx="1" fill="currentColor" opacity="0.8"/>
                    <rect x="34" y="6"  width="8" height="8" rx="1" fill="currentColor" opacity="0.3"/>
                    <rect x="6"  y="20" width="8" height="8" rx="1" fill="currentColor" opacity="0.9"/>
                    <rect x="20" y="20" width="8" height="8" rx="1" fill="currentColor"/>
                    <rect x="34" y="20" width="8" height="8" rx="1" fill="currentColor" opacity="0.6"/>
                    <rect x="6"  y="34" width="8" height="8" rx="1" fill="currentColor" opacity="0.4"/>
                    <rect x="20" y="34" width="8" height="8" rx="1" fill="currentColor" opacity="0.7"/>
                    <rect x="34" y="34" width="8" height="8" rx="1" fill="currentColor" opacity="0.9"/>
                  </svg>
                )}
              </div>
              <h2 className="mt-4 text-xl font-semibold text-gray-900 truncate">{p.name}</h2>
              <p className="mt-1 text-sm text-gray-500">{p.width} × {p.height} stitches</p>
              <p className="mt-1 text-xs text-gray-400">{formatDate(p.modifiedAt)}</p>
              <div className="mt-5 flex items-center gap-2 pt-2">
                <Link
                  href={`/photo-to-cross-stitch?pattern=${p.id}`}
                  className="inline-flex rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 transition hover:border-gray-900 hover:text-gray-900"
                >
                  Open in converter
                </Link>
                {confirmDeleteId === p.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      disabled={deletingId === p.id}
                      className="inline-flex rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                    >
                      {deletingId === p.id ? 'Deleting…' : 'Confirm delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={deletingId === p.id}
                      className="inline-flex rounded-full border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 transition hover:border-gray-900 hover:text-gray-900"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(p.id)}
                    className="ml-auto inline-flex rounded-full border border-transparent px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                    aria-label={`Delete ${p.name}`}
                  >
                    Delete
                  </button>
                )}
              </div>
              {deleteError && confirmDeleteId === p.id && (
                <p className="mt-2 text-xs text-red-600">{deleteError}</p>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
