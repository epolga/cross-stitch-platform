import type { Metadata } from "next";
import ResetPasswordForm from "../ResetPasswordForm";

type Props = {
  params: Promise<{ token: string }>;
};

export const metadata: Metadata = {
  title: "Set a New Password | Cross Stitch Pattern",
  description: "Update your Cross Stitch Pattern account password using your secure reset link.",
  robots: "noindex, nofollow",
};

export default async function ResetPasswordPage({ params }: Props) {
  const { token } = await params;
  return <ResetPasswordForm token={token} />;
}
