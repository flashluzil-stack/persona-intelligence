import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guard, jsonError } from "@/lib/api";
import { uuidSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Purchase status for the post-checkout page. Read through RLS: only the buyer can see it. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const g = await guard(request);
  if ("response" in g) return g.response;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError(404, g.t.errors.notFound);
  const { data } = await g.auth.supabase.from("purchases").select("id, status, kind, research_project_id, product_key").eq("id", id).maybeSingle();
  if (!data) return jsonError(404, g.t.errors.notFound);
  return NextResponse.json(
    { id: data.id, status: data.status, kind: data.kind, projectId: data.research_project_id, product: data.product_key },
    { headers: { "Cache-Control": "no-store" } },
  );
}
