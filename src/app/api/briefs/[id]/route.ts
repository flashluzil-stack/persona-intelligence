import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guard, jsonError } from "@/lib/api";
import { mutationLimiter } from "@/lib/security/rate-limit";
import { uuidSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const g = await guard(request, { limiter: mutationLimiter });
  if ("response" in g) return g.response;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError(404, g.t.errors.notFound);
  const { data, error } = await g.auth.supabase.from("meeting_briefs").delete().eq("id", id).select("id");
  if (error) return jsonError(500, g.t.errors.deleteFailed);
  if (!data?.length) return jsonError(404, g.t.errors.notFound);
  return NextResponse.json({ ok: true });
}
