import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guard, jsonError, readJson, requireFullReport, validationError } from "@/lib/api";
import { PROFILE_SECTION_TYPES, type ProfileSectionType } from "@/lib/ai/schemas";
import { mutationLimiter } from "@/lib/security/rate-limit";
import { sectionOverrideSchema, uuidSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string; type: string }> };

/** Saves (or clears, with empty text) the user's own edited summary for a section. */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const g = await guard(request, { limiter: mutationLimiter });
  if ("response" in g) return g.response;
  const { id, type } = await params;
  if (!uuidSchema.safeParse(id).success || !PROFILE_SECTION_TYPES.includes(type as ProfileSectionType)) {
    return jsonError(404, g.t.errors.notFound);
  }
  const locked = await requireFullReport(g, id);
  if (locked) return locked;
  const parsed = sectionOverrideSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error, g.t);
  const text = parsed.data.text || null;
  const { data, error } = await g.auth.supabase
    .from("profile_sections")
    .update({ user_override: text, user_override_at: text ? new Date().toISOString() : null })
    .eq("research_project_id", id)
    .eq("section_type", type)
    .eq("is_current", true)
    .select("id");
  if (error) return jsonError(500, g.t.errors.saveFailed);
  if (!data?.length) return jsonError(404, g.t.errors.notFound);
  return NextResponse.json({ ok: true });
}
