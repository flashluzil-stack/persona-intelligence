import { AppHeader } from "@/components/layout/app-header";
import { requireAuth } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAuth();
  return (
    <>
      <AppHeader email={user.email} guest={Boolean(user.is_anonymous)} />
      <main id="main" className="flex-1 pb-20">
        {children}
      </main>
    </>
  );
}
