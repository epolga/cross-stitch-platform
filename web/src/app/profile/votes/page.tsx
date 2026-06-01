import type { Metadata } from 'next';
import ProfileVotesPageClient from './ProfileVotesPageClient';

export const metadata: Metadata = {
  title: 'Your voted designs | Cross Stitch',
  description: 'Private profile page with the cross-stitch designs you have voted on.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ProfileVotesPage() {
  return <ProfileVotesPageClient />;
}