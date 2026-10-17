import type { NextRequest } from "next/server";
import { guard, jsonError, requireFullReport } from "@/lib/api";
import { loadBriefBundle } from "@/lib/db/queries";
import { briefMarkdown } from "@/lib/export/markdown";
import { uuidSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const g = await guard(request);
  if ("response" in g) return g.response;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError(404, g.t.errors.notFound);
  const bundle = await loadBriefBundle(g.auth.supabase, id);
  if (!bundle) return jsonError(404, g.t.errors.notFound);
  const locked = await requireFullReport(g, bundle.project.id);
  if (locked) return locked;
  const body = briefMarkdown({
    personName: bundle.project.input.fullName,
    objective: bundle.brief.objective,
    createdAt: bundle.brief.createdAt,
    brief: bundle.brief.brief,
    claims: bundle.claims,
    sources: bundle.sources,
    t: g.t,
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="meeting-brief-${id.slice(0, 8)}.md"`,
      "Cache-Control": "no-store",
    },
  });
}
