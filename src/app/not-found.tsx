import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-5 py-24 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">404</p>
      <h1 className="text-3xl font-semibold">Not found</h1>
      <p className="text-sm text-muted">This page does not exist, or it belongs to another account.</p>
      <Link href="/" className="text-sm font-medium text-accent underline">
        Go to the home page
      </Link>
    </main>
  );
}
