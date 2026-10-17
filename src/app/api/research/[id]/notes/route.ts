import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guard, jsonError, readJson, validationError } from "@/lib/api";
import { mutationLimiter } from "@/lib/security/rate-limit";
import { noteInputSchema, uuidSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Creates a private note on a research project. Notes are never sent to AI providers. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const g = await guard(request, { limiter: mutationLimiter });
  if ("response" in g) return g.response;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError(404, g.t.errors.notFound);
  const parsed = noteInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error, g.t);
  const { supabase, user } = g.auth;
  const { data: project } = await supabase.from("research_projects").select("id, person_id").eq("id", id).maybeSingle();
  if (!project) return jsonError(404, g.t.errors.notFound);
  const { data, error } = await supabase
    .from("user_notes")
    .insert({
      user_id: user.id,
      research_project_id: id,
      person_id: project.person_id,
      section_type: parsed.data.sectionType ?? null,
      content: parsed.data.content,
    })
    .select("id")
    .single();
  if (error || !data) return jsonError(500, g.t.errors.saveFailed);
  return NextResponse.json({ id: data.id }, { status: 201 });
}
