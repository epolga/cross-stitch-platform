import type { Metadata } from 'next';
import ProfilePatternsPageClient from './ProfilePatternsPageClient';

export const metadata: Metadata = {
  title: 'Your saved patterns | Cross Stitch',
  description: 'Private profile page with your saved cross-stitch patterns.',
  robots: { index: false, follow: false },
};

export default function ProfilePatternsPage() {
  return <ProfilePatternsPageClient />;
}
