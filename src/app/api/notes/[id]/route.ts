import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guard, jsonError, readJson, validationError } from "@/lib/api";
import { mutationLimiter } from "@/lib/security/rate-limit";
import { noteInputSchema, uuidSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const g = await guard(request, { limiter: mutationLimiter });
  if ("response" in g) return g.response;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError(404, "Not found.");
  const parsed = noteInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const { data, error } = await g.auth.supabase.from("user_notes").update({ content: parsed.data.content }).eq("id", id).select("id");
  if (error) return jsonError(500, "Could not update the note.");
  if (!data?.length) return jsonError(404, "Not found.");
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const g = await guard(request, { limiter: mutationLimiter });
  if ("response" in g) return g.response;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError(404, "Not found.");
  const { data, error } = await g.auth.supabase.from("user_notes").delete().eq("id", id).select("id");
  if (error) return jsonError(500, "Could not delete the note.");
  if (!data?.length) return jsonError(404, "Not found.");
  return NextResponse.json({ ok: true });
}
