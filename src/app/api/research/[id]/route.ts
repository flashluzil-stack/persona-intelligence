import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guard, jsonError } from "@/lib/api";
import { mutationLimiter } from "@/lib/security/rate-limit";
import { uuidSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Deletes a research project and everything derived from it (cascade). */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const g = await guard(request, { limiter: mutationLimiter });
  if ("response" in g) return g.response;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError(404, "Not found.");
  const { supabase, user } = g.auth;
  const { data, error } = await supabase.from("research_projects").delete().eq("id", id).select("id");
  if (error) return jsonError(500, "Could not delete the project.");
  if (!data?.length) return jsonError(404, "Not found.");
  await supabase.from("audit_events").insert({ user_id: user.id, event_type: "research.deleted", metadata: { projectId: id } });
  return NextResponse.json({ ok: true });
}
