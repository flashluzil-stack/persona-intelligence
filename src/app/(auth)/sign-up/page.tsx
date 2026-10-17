import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/layout/auth-forms";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <>
      <div className="space-y-1 text-center">
        <h1 className="text-3xl font-semibold">Create your account</h1>
        <p className="text-sm text-muted">Research public sources and prepare evidence-based meeting briefs.</p>
      </div>
      <SignUpForm />
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-ink underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
