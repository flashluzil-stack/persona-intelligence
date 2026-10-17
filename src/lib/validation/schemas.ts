import { z } from "zod";
import { assertPublicUrl } from "@/lib/security/ip";

/** Collapse whitespace and strip control characters from free-text input. */
function cleanText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
}

const optionalText = (max: number, label: string) =>
  z
    .string()
    .transform(cleanText)
    .pipe(z.string().max(max, `${label} must be at most ${max} characters`))
    .transform((v) => (v ? v : undefined))
    .optional();

const multilineText = (max: number, label: string) =>
  z
    .string()
    .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(max, `${label} must be at most ${max} characters`))
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

export const PURPOSE_LABELS: Record<ResearchPurpose, string> = {
  job_interview: "Job interview",
  hiring_interview: "Hiring interview",
  investor_meeting: "Investor meeting",
  business_partnership: "Business partnership",
  sales_meeting: "Sales meeting",
  client_discovery: "Client discovery",
  networking: "Networking",
  negotiation: "Negotiation",
  collaboration: "Professional collaboration",
  other: "Other",
};

export const publicProfileUrlSchema = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().max(2048, "URL is too long"))
  .refine(
    (value) => {
      try {
        assertPublicUrl(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Enter a public http(s) URL, for example https://example.com/about" },
  );

export const researchInputSchema = z.object({
  fullName: z
    .string({ error: "Full name is required" })
    .transform(cleanText)
    .pipe(
      z
        .string()
        .min(2, "Full name is required")
        .max(120, "Full name must be at most 120 characters")
        .refine((v) => /\p{L}/u.test(v), "Full name must contain letters"),
    ),
  company: optionalText(160, "Company"),
  role: optionalText(160, "Job title or profession"),
  location: optionalText(120, "Location"),
  profileUrl: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : undefined))
    .pipe(publicProfileUrlSchema.optional()),
  purpose: z.enum(RESEARCH_PURPOSES).optional(),
  context: multilineText(1500, "Additional context"),
});

export type ResearchInput = z.infer<typeof researchInputSchema>;

export const MEETING_OBJECTIVES = RESEARCH_PURPOSES;

export const meetingBriefInputSchema = z.object({
  objective: z.enum(MEETING_OBJECTIVES, { error: "Choose a meeting objective" }),
  desiredOutcome: multilineText(1000, "Desired outcome"),
  offering: multilineText(1000, "What you are offering"),
  background: multilineText(1500, "Relevant background"),
  constraints: multilineText(1000, "Known constraints"),
  questions: multilineText(1500, "Questions you want answered"),
  durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
});

export type MeetingBriefInput = z.infer<typeof meetingBriefInputSchema>;

export const noteInputSchema = z.object({
  content: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Note cannot be empty").max(10_000, "Note must be at most 10,000 characters")),
  sectionType: z.string().max(40).optional(),
});

export const sectionOverrideSchema = z.object({
  text: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().max(10_000, "Edited text must be at most 10,000 characters")),
});

export const identitySelectionSchema = z.object({
  candidateId: z.string().min(1).max(40),
  additionalContext: multilineText(500, "Additional context"),
});

export const settingsSchema = z.object({
  displayName: optionalText(120, "Display name"),
  retentionDays: z.coerce.number().int().min(7).max(3650),
  confirmBeforeResearch: z.coerce.boolean().optional(),
});

export const uuidSchema = z.uuid();

/** Flattens Zod issues into a field → message map suitable for forms and API errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
