import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/layout/auth-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <>
      <div className="space-y-1 text-center">
        <h1 className="text-3xl font-semibold">Choose a new password</h1>
      </div>
      <ResetPasswordForm />
    </>
  );
}
