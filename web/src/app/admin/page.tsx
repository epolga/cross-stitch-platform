'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isUserLoggedIn } from '@/app/components/AuthControl';

interface AdminCard {
  title: string;
  description: string;
  href?: string;
  icon: string;
  badge?: string;
  badgeColor?: string;
  comingSoon?: boolean;
}

const CARDS: AdminCard[] = [
  {
    icon: '💬',
    title: 'Feature Requests',
    description: 'User feedback and feature votes from the converter editor. Review, triage, and track status.',
    href: '/admin/feature-requests',
    badge: 'Live',
    badgeColor: 'bg-green-100 text-green-700',
  },
  {
    icon: '📊',
    title: 'Editor Analytics',
    description: 'Daily funnel — opens → conversions → PDF exports. Entry sources, errors, and feedback summary.',
    href: '/admin/editor-analytics',
    badge: 'Live',
    badgeColor: 'bg-green-100 text-green-700',
  },
  {
    icon: '🔍',
    title: 'Search Queries',
    description: 'Top search terms, zero-result queries, and search volume trends. Data already collected in DDB.',
    comingSoon: true,
  },
  {
    icon: '👥',
    title: 'Registered Users',
    description: 'User list with registration date, last seen, subscription status, and activity summary.',
    comingSoon: true,
  },
  {
    icon: '💰',
    title: 'Daily Business',
    description: 'Revenue, ad spend, and profit dashboard. Per-pin attribution and 30-day trends from DAILY_BUSINESS.',
    comingSoon: true,
  },
  {
    icon: '🖼️',
    title: 'Design Performance',
    description: 'Top designs by views, likes, and downloads. Identify what to pin more and what to retire.',
    comingSoon: true,
  },
];

export default function AdminHubPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  useEffect(() => {
    if (!isUserLoggedIn()) { router.replace('/'); return; }
    fetch('/api/admin/me', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { isAdmin?: boolean }) => {
        if (!d.isAdmin) { router.replace('/'); return; }
        setReady(true);
      })
      .catch(() => router.replace('/'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRefreshCache() {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const res = await fetch('/api/admin/refresh-cache', { method: 'POST' });
      const data = await res.json();
      setRefreshResult(res.ok ? `Done in ${data.ms}ms` : (data.error || 'Failed'));
    } catch {
      setRefreshResult('Failed');
    } finally {
      setRefreshing(false);
    }
  }

  if (!ready) return null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Admin</h1>
      <p className="text-sm text-gray-500 mb-6">Internal tools and dashboards.</p>

      <div className="mb-8 flex items-center gap-3">
        <button
          onClick={handleRefreshCache}
          disabled={refreshing}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {refreshing ? 'Refreshing…' : 'Refresh design cache'}
        </button>
        {refreshResult && (
          <span className="text-xs text-gray-500">{refreshResult}</span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map(card => (
          <div
            key={card.title}
            className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3 ${card.comingSoon ? 'opacity-60' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-2xl leading-none">{card.icon}</span>
              {card.badge && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${card.badgeColor}`}>
                  {card.badge}
                </span>
              )}
              {card.comingSoon && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                  Coming soon
                </span>
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-gray-900 mb-1">{card.title}</h2>
              <p className="text-xs text-gray-500 leading-relaxed">{card.description}</p>
            </div>
            {card.href && (
              <Link
                href={card.href}
                className="self-start text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                Open →
              </Link>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
