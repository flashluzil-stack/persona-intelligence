import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getServiceRoleKey } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Guest (anonymous) sessions let visitors try a free preview without an
 * account. When the visitor later signs in or signs up — possibly as a
 * different user id — their guest reports are moved to that account.
 *
 * The guest id is remembered in an HMAC-signed, httpOnly cookie so it cannot
 * be forged to claim another guest's reports.
 */

const COOKIE = "pi_guest";

function sign(value: string): string | null {
  const key = getServiceRoleKey();
  if (!key) return null;
  return createHmac("sha256", key).update(`guest:${value}`).digest("base64url");
}

export async function rememberGuest(guestId: string): Promise<void> {
  const sig = sign(guestId);
  if (!sig) return;
  (await cookies()).set(COOKIE, `${guestId}.${sig}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function readGuest(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, sig] = raw.split(".");
  const expected = id ? sign(id) : null;
  if (!id || !sig || !expected) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

/** Moves a remembered guest's reports to the now-signed-in permanent user. Never throws. */
export async function adoptGuestReports(newUser: { id: string; is_anonymous?: boolean }, knownGuestId?: string | null): Promise<number> {
  try {
    if (newUser.is_anonymous) return 0;
    const guestId = knownGuestId ?? (await readGuest());
    if (!guestId || guestId === newUser.id || !getServiceRoleKey()) return 0;
    const { data, error } = await createServiceClient().rpc("transfer_guest_data", { p_from: guestId, p_to: newUser.id });
    (await cookies()).delete(COOKIE);
    if (error) {
      console.error("[guest] transfer failed", error.message);
      return 0;
    }
    return typeof data === "number" ? data : 0;
  } catch (err) {
    console.error("[guest] transfer error", err instanceof Error ? err.message : err);
    return 0;
  }
}
