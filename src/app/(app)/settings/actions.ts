"use server";

import { revalidatePath } from "next/cache";
import { getAuth } from "@/lib/auth";
import { settingsSchema } from "@/lib/validation/schemas";

export interface SettingsState {
  error?: string;
  message?: string;
}

export async function saveSettingsAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const auth = await getAuth();
  if (!auth) return { error: "Please sign in again." };
  const parsed = settingsSchema.safeParse({
    displayName: form.get("displayName") ?? undefined,
    retentionDays: form.get("retentionDays"),
    confirmBeforeResearch: form.get("confirmBeforeResearch") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid settings." };
  const { data: existing } = await auth.supabase.from("user_settings").select("research_preferences").eq("user_id", auth.user.id).maybeSingle();
  const prefs = { ...((existing?.research_preferences as Record<string, unknown>) ?? {}), confirmBeforeResearch: parsed.data.confirmBeforeResearch ?? false };
  const { error } = await auth.supabase.from("user_settings").upsert(
    {
      user_id: auth.user.id,
      display_name: parsed.data.displayName ?? null,
      retention_days: parsed.data.retentionDays,
      research_preferences: prefs,
    },
    { onConflict: "user_id" },
  );
  if (error) return { error: "Could not save settings." };
  await auth.supabase.from("audit_events").insert({ user_id: auth.user.id, event_type: "settings.updated", metadata: { retentionDays: parsed.data.retentionDays } });
  revalidatePath("/settings");
  return { message: "Settings saved." };
}
