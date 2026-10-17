import { z } from "zod";
import en, { type Messages } from "@/i18n/messages/en";
import { assertPublicUrl } from "@/lib/security/ip";

/*
 * Validation messages are translation keys ("v:<key>" or "v:tooLong:<max>"),
 * resolved to the user's language by fieldErrors(). Schemas stay locale-free
 * so the same rules run in the browser and on the server.
 */

/** Collapse whitespace and strip control characters from free-text input. */
function cleanText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
}

const optionalText = (max: number) =>
  z
    .string()
    .transform(cleanText)
    .pipe(z.string().max(max, `v:tooLong:${max}`))
    .transform((v) => (v ? v : undefined))
    .optional();

const multilineText = (max: number) =>
  z
    .string()
    .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(max, `v:tooLong:${max}`))
    .transform((v) => (v ? v : undefined))
    .optional();

export const RESEARCH_PURPOSES = [
  "job_interview",
  "hiring_interview",
  "investor_meeting",
  "business_partnership",
  "sales_meeting",
  "client_discovery",
  "networking",
  "negotiation",
  "collaboration",
  "other",
] as const;

export type ResearchPurpose = (typeof RESEARCH_PURPOSES)[number];

/** English labels (used in AI prompts). The UI uses the localized `t.purposes`. */
export const PURPOSE_LABELS: Record<ResearchPurpose, string> = en.purposes;

export function isPurpose(value: unknown): value is ResearchPurpose {
  return typeof value === "string" && (RESEARCH_PURPOSES as readonly string[]).includes(value);
}

export const publicProfileUrlSchema = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().max(2048, "v:urlTooLong"))
  .refine(
    (value) => {
      try {
        assertPublicUrl(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "v:url" },
  );

export const researchInputSchema = z.object({
  fullName: z
    .string({ error: "v:fullNameRequired" })
    .transform(cleanText)
    .pipe(
      z
        .string()
        .min(2, "v:fullNameRequired")
        .max(120, "v:fullNameTooLong")
        .refine((v) => /\p{L}/u.test(v), "v:fullNameLetters"),
    ),
  company: optionalText(160),
  role: optionalText(160),
  location: optionalText(120),
  profileUrl: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : undefined))
    .pipe(publicProfileUrlSchema.optional()),
  purpose: z.enum(RESEARCH_PURPOSES).optional(),
  context: multilineText(1500),
  /** Language of the generated report (set from the interface language). */
  locale: z.enum(["en", "he"]).optional(),
});

export type ResearchInput = z.infer<typeof researchInputSchema>;

export const MEETING_OBJECTIVES = RESEARCH_PURPOSES;

export const meetingBriefInputSchema = z.object({
  objective: z.enum(MEETING_OBJECTIVES, { error: "v:objective" }),
  desiredOutcome: multilineText(1000),
  offering: multilineText(1000),
  background: multilineText(1500),
  constraints: multilineText(1000),
  questions: multilineText(1500),
  durationMinutes: z.coerce.number({ error: "v:duration" }).int("v:duration").min(5, "v:duration").max(480, "v:duration").optional(),
});

export type MeetingBriefInput = z.infer<typeof meetingBriefInputSchema>;

export const noteInputSchema = z.object({
  content: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "v:noteEmpty").max(10_000, "v:tooLong:10000")),
  sectionType: z.string().max(40).optional(),
});

export const sectionOverrideSchema = z.object({
  text: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().max(10_000, "v:tooLong:10000")),
});

export const identitySelectionSchema = z.object({
  candidateId: z.string().min(1).max(40),
  additionalContext: multilineText(500),
});

export const settingsSchema = z.object({
  displayName: optionalText(120),
  retentionDays: z.coerce.number().int().min(7).max(3650),
  confirmBeforeResearch: z.coerce.boolean().optional(),
});

export const uuidSchema = z.uuid();

/** Resolves a validation message key to text in the given language. */
export function validationMessage(message: string, t: Messages = en): string {
  if (!message.startsWith("v:")) return t.validation.invalid;
  const [, key, arg] = message.split(":");
  if (key === "tooLong") return t.validation.tooLong(Number(arg));
  const v = t.validation as unknown as Record<string, unknown>;
  return typeof v[key] === "string" ? (v[key] as string) : t.validation.invalid;
}

/** Flattens Zod issues into a field → localized message map for forms and API errors. */
export function fieldErrors(error: z.ZodError, t: Messages = en): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = validationMessage(issue.message, t);
  }
  return out;
}
