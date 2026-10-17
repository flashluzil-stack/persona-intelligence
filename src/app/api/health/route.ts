import { NextResponse } from "next/server";
import { getPublicConfig } from "@/lib/config";

/** Deployment health check. Reports which capabilities are configured — never any values or keys. */
export async function GET() {
  const cfg = getPublicConfig();
  return NextResponse.json(
    {
      ok: true,
      mode: cfg.mode,
      auth: cfg.authConfigured,
      search: cfg.searchConfigured ? cfg.searchProvider : false,
      ai: cfg.analysisConfigured,
      pageRetrieval: cfg.pageRetrievalEnabled,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
