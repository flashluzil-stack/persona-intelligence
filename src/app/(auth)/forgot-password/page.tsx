import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/layout/auth-forms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <div className="space-y-1 text-center">
        <h1 className="text-3xl font-semibold">Reset your password</h1>
        <p className="text-sm text-muted">We will email you a secure link.</p>
      </div>
      <ForgotPasswordForm />
      <p className="text-center text-sm text-muted">
        <Link href="/sign-in" className="underline hover:text-ink">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
