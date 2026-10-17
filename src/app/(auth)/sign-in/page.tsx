import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/components/layout/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  return (
    <>
      <div className="space-y-1 text-center">
        <h1 className="text-3xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted">Your research projects are private to your account.</p>
      </div>
      <SignInForm next={next} linkError={params.error === "link"} />
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href="/sign-up" className="font-medium text-ink underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
