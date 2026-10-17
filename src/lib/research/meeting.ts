import { meetingBriefPrompt } from "@/lib/ai/prompts";
import { meetingBriefSchema, type MeetingBrief } from "@/lib/ai/schemas";
import type { StructuredModel } from "@/lib/providers/analysis/openai";
import type { MeetingBriefInput } from "@/lib/validation/schemas";
import { claimRefs } from "./profile";
import type { ClaimRow } from "./store";
import en from "@/i18n/messages/en";
import { getMessages } from "@/i18n/messages";
import type { UsageRecord } from "./types";

/** Stored brief: same shape as the AI schema, with claim refs replaced by claim UUIDs. */
export type StoredMeetingBrief = MeetingBrief & {
  dropped_unsupported: number;
  evidence_note: string | null;
};

const DEFAULT_NOTES = { none: en.brief.noVerifiedClaims, dropped: en.brief.evidenceDropped };

const CONFIDENCE_ORDER = { high: 0, moderate: 1, low: 2, insufficient: 3 } as const;

/**
 * Post-validates a brief: drops "facts", "developments" and "risks" that do
 * not cite at least one known claim, and maps references to stored ids.
 */
export function postprocessBrief(raw: MeetingBrief, byRef: Map<string, ClaimRow>, notes: { none: string; dropped: (n: number) => string } = DEFAULT_NOTES): StoredMeetingBrief {
  let dropped = 0;
  const map = (ids: string[]) => [...new Set(ids.map((r) => byRef.get(r)?.id).filter((v): v is string => Boolean(v)))];
  const required = <T extends { claim_ids: string[] }>(items: T[]) =>
    items
      .map((i) => ({ ...i, claim_ids: map(i.claim_ids) }))
      .filter((i) => {
        if (i.claim_ids.length === 0) dropped++;
        return i.claim_ids.length > 0;
      });
  const optional = <T extends { claim_ids: string[] }>(items: T[]) => items.map((i) => ({ ...i, claim_ids: map(i.claim_ids) }));

  return {
    executive_summary: raw.executive_summary,
    key_facts: required(raw.key_facts).slice(0, 5),
    conversation_topics: optional(raw.conversation_topics).slice(0, 5),
    questions: optional(raw.questions).slice(0, 7),
    professional_overlap: optional(raw.professional_overlap),
    recent_developments: required(raw.recent_developments),
    unknowns_to_clarify: raw.unknowns_to_clarify,
    documented_risks: required(raw.documented_risks),
    suggested_opening: raw.suggested_opening,
    checklist: raw.checklist,
    dropped_unsupported: dropped,
    evidence_note: byRef.size === 0 ? notes.none : dropped > 0 ? notes.dropped(dropped) : null,
  };
}

export async function generateMeetingBrief(
  model: StructuredModel,
  args: { personName: string; brief: MeetingBriefInput; profileSummary: string; claims: ClaimRow[]; signal?: AbortSignal; language?: "en" | "he" },
): Promise<{ brief: StoredMeetingBrief; usage: UsageRecord; model: string }> {
  // Most reliable claims first; cap the prompt size.
  const ordered = [...args.claims]
    .filter((c) => c.confidenceLabel !== "insufficient")
    .sort((a, b) => CONFIDENCE_ORDER[a.confidenceLabel] - CONFIDENCE_ORDER[b.confidenceLabel])
    .slice(0, 60);
  const refs = claimRefs(ordered, new Map());
  const language = args.language ?? "en";
  const prompt = meetingBriefPrompt(args.personName, args.brief, args.profileSummary, refs.prompt, language);
  const { data, usage, model: modelName } = await model.generate(
    { name: "meeting_brief", schema: meetingBriefSchema, maxOutputTokens: 6000, ...prompt },
    args.signal,
  );
  const t = getMessages(language);
  return { brief: postprocessBrief(data, refs.byRef, { none: t.brief.noVerifiedClaims, dropped: t.brief.evidenceDropped }), usage, model: modelName };
}
