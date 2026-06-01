// src/app/reset-password/page.tsx
import type { Metadata } from 'next';
import ResetPasswordRequestForm from './ResetPasswordRequestForm';

export const metadata: Metadata = {
  title: 'Reset Password | Cross Stitch Pattern',
  description: 'Request a password reset link to regain access to your Cross Stitch Pattern account.',
  robots: 'noindex, nofollow',
};

export default function RequestPasswordResetPage() {
  return <ResetPasswordRequestForm />;
}
