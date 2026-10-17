import type { NextRequest } from "next/server";
import { guard } from "@/lib/api";
import { exportUserData } from "@/lib/db/account";
import { mutationLimiter } from "@/lib/security/rate-limit";

export async function GET(request: NextRequest) {
  const g = await guard(request, { limiter: mutationLimiter });
  if ("response" in g) return g.response;
  const { supabase, user } = g.auth;
  const data = await exportUserData(supabase, user);
  await supabase.from("audit_events").insert({ user_id: user.id, event_type: "account.exported", metadata: {} });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="persona-intelligence-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
