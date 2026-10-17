import { SECTION_LABELS, type ProfileSectionType } from "@/lib/ai/schemas";
import { CONFIDENCE_LABELS } from "@/lib/research/evidence";
import type { StoredMeetingBrief } from "@/lib/research/meeting";
import type { StoredInterestTopic, StoredRecentItem, StoredValueItem, VisualStyleContent } from "@/lib/research/profile";
import type { ClaimRow, QualityReport, SectionRow } from "@/lib/research/store";
import { SOURCE_TYPE_LABELS, type SourceRecord } from "@/lib/research/types";
import { CitationIndex } from "./citations";

/**
 * Markdown exports. Uncertainty labels, caveats and source links are always
 * included; private notes only when the user explicitly opts in.
 */

const DISCLAIMER =
  "Generated from publicly available sources. It may be incomplete or outdated, and it is not a background check. Verify important facts independently. Do not use for employment, credit, housing or insurance eligibility decisions.";

/** Escapes characters that could turn source-controlled text into Markdown/HTML markup. */
export function md(text: string | null | undefined): string {
  return (text ?? "").replace(/[\\`*_{}[\]<>#|]/g, (c) => `\\${c}`).replace(/\r?\n/g, " ");
}

const fmtDate = (d: string | null | undefined) => (d ? d.slice(0, 10) : "date unknown");

type Cited = { text: string; claim_ids: string[] };

export interface ProfileExportData {
  personName: string;
  projectName: string;
  lastResearchedAt: string | null;
  sections: SectionRow[];
  claims: ClaimRow[];
  sources: SourceRecord[];
  quality: QualityReport | null;
  notes?: Array<{ content: string; sectionType: string | null; createdAt: string }>;
}

function sectionBody(section: SectionRow, cite: CitationIndex): string[] {
  const c = section.content as Record<string, unknown>;
  const lines: string[] = [];
  const list = (items: Cited[] | undefined, heading?: string) => {
    if (!items?.length) return;
    if (heading) lines.push(`**${heading}**`, "");
    for (const i of items) lines.push(`- ${md(i.text)} ${cite.citeClaims(i.claim_ids)}`);
    lines.push("");
  };
  if (section.userOverride) {
    lines.push(`> **Edited by you** (${fmtDate(section.userOverrideAt)}): ${md(section.userOverride)}`, "");
  }
  if (typeof c.summary === "string") lines.push(md(c.summary), "");

  switch (section.sectionType) {
    case "overview": {
      const role = c.current_role as Cited | null;
      lines.push(role ? `**Current role (verified as current):** ${md(role.text)} ${cite.citeClaims(role.claim_ids)}` : "**Current role:** not verified as current.", "");
      list(c.key_points as Cited[], "Key points");
      break;
    }
    case "background": {
      const positions = (c.positions as Array<{ title: string; organization: string; period: string | null; status: string; claim_ids: string[] }>) ?? [];
      if (positions.length) {
        lines.push("**Positions**", "");
        for (const p of positions) {
          lines.push(`- ${md(p.title)}, ${md(p.organization)}${p.period ? ` (${md(p.period)})` : ""} — ${p.status} ${cite.citeClaims(p.claim_ids)}`);
        }
        lines.push("");
      }
      list(c.education as Cited[], "Education");
      list(c.achievements as Cited[], "Achievements");
      list(c.publications as Cited[], "Publications");
      list(c.projects as Cited[], "Projects");
      break;
    }
    case "interests":
      for (const t of (c.topics as StoredInterestTopic[]) ?? []) {
        lines.push(
          `- **${md(t.topic)}** — ${md(t.description)} (${t.recurring ? `recurring: ${t.source_count} sources` : "single mention; not established as recurring"}${t.most_recent_date ? `, most recent ${t.most_recent_date}` : ""}) ${cite.citeSources(t.source_ids)}`,
        );
      }
      lines.push("");
      break;
    case "communication":
      for (const o of (c.observations as Array<{ dimension: string; observation: string; source_ids: string[] }>) ?? []) {
        lines.push(`- _${md(o.dimension)}_: ${md(o.observation)} ${cite.citeSources(o.source_ids)}`);
      }
      lines.push("");
      break;
    case "values":
      for (const v of (c.items as StoredValueItem[]) ?? []) {
        const body = v.kind === "direct_quote" && v.quote ? `“${md(v.quote)}” (direct quote)` : `${md(v.idea)} (paraphrase)`;
        lines.push(`- ${body} ${cite.citeSources([v.source_id])}${v.note ? ` — ${md(v.note)}` : ""}`);
      }
      lines.push("");
      break;
    case "relationships":
      for (const r of (c.items as Array<{ counterpart: string; relationship: string; description: string; claim_ids: string[] }>) ?? []) {
        lines.push(`- ${md(r.counterpart)} — ${r.relationship.replace(/_/g, " ")}: ${md(r.description)} ${cite.citeClaims(r.claim_ids)}`);
      }
      lines.push("");
      break;
    case "recent":
      for (const r of (c.items as StoredRecentItem[]) ?? []) {
        lines.push(
          `- ${md(r.summary)} — published ${fmtDate(r.published_at)}${r.reported_event_date ? `; event date reported as ${md(r.reported_event_date)}` : ""}. Why it may matter: ${md(r.why_it_may_matter)} ${cite.citeSources([r.source_id])}`,
        );
      }
      lines.push("");
      break;
    case "visual_style":
      lines.push(md((c as unknown as VisualStyleContent).reason), "");
      break;
    case "open_questions": {
      const group = (key: string, label: string) => {
        const items = (c[key] as string[]) ?? [];
        if (!items.length) return;
        lines.push(`**${label}**`, "", ...items.map((i) => `- ${md(i)}`), "");
      };
      group("missing_information", "Missing information");
      group("conflicting_information", "Conflicting information");
      group("needs_verification", "Needs independent verification");
      group("insufficient_evidence_areas", "Insufficient evidence");
      group("questions_to_ask", "Questions to ask directly");
      break;
    }
  }
  const limitations = c.limitations as string[] | undefined;
  if (limitations?.length) lines.push("_Limitations:_", ...limitations.map((l) => `- ${md(l)}`), "");
  return lines;
}

const SECTION_ORDER: ProfileSectionType[] = ["overview", "background", "interests", "communication", "visual_style", "values", "relationships", "recent", "open_questions"];

export function bibliographyMarkdown(sources: SourceRecord[], numbered = true): string[] {
  return sources.map((s, i) => {
    const prefix = numbered ? `${i + 1}. ` : "- ";
    const status =
      s.retrievalStatus === "retrieved" ? "full page analysed" : s.retrievalStatus === "snippet_only" ? "search snippet only" : `not retrieved (${s.retrievalStatus.replace("_", " ")})`;
    return `${prefix}${md(s.title ?? s.domain)} — <${s.url}> · ${SOURCE_TYPE_LABELS[s.sourceType]} · published ${fmtDate(s.publishedAt)} · accessed ${fmtDate(s.accessedAt)} · ${status}`;
  });
}

export function profileMarkdown(data: ProfileExportData, part: "profile" | "report"): string {
  const cite = new CitationIndex(data.sources, data.claims);
  const out: string[] = [
    `# ${md(data.personName)} — ${part === "report" ? "Research report" : "Profile summary"}`,
    "",
    `_Last researched: ${fmtDate(data.lastResearchedAt)}. Exported ${new Date().toISOString().slice(0, 10)} from Persona Intelligence._`,
    "",
    `> ${DISCLAIMER}`,
    "",
  ];
  const sections = new Map(data.sections.map((s) => [s.sectionType, s]));
  const order: ProfileSectionType[] = part === "profile" ? ["overview", "background", "interests", "recent", "open_questions"] : SECTION_ORDER;
  for (const type of order) {
    const s = sections.get(type);
    if (!s) continue;
    out.push(`## ${SECTION_LABELS[type]}`, "", ...sectionBody(s, cite));
  }

  if (part === "report" && data.claims.length) {
    out.push("## Evidence register", "");
    for (const c of data.claims) {
      out.push(
        `- ${md(c.claimText)} — **${CONFIDENCE_LABELS[c.confidenceLabel]}** (${c.verificationStatus.replace("_", " ")}; ${c.evidenceType.replace("_", " ")}). ${md(c.confidenceRationale)} ${cite.citeClaims([c.id])}${c.limitations ? ` _${md(c.limitations)}_` : ""}`,
      );
    }
    out.push("");
  }

  if (data.quality) {
    const q = data.quality;
    out.push(
      "## Research quality",
      "",
      `- Sources found: ${q.sourcesFound} (${q.sourcesRetrieved} full pages, ${q.sourcesSnippetOnly} snippet only, ${q.sourcesNotPermitted} not permitted/blocked, ${q.sourcesFailed} failed, ${q.sourcesUnrelated} about other people)`,
      `- Claims: ${q.claimsExtracted} verified, ${q.claimsRejected} discarded as unverifiable`,
      `- Conflicts: ${q.conflicts.length ? q.conflicts.map((c) => md(c.description)).join("; ") : "none detected"}`,
      `- Sections with insufficient evidence: ${q.insufficientSections.length ? q.insufficientSections.join(", ") : "none"}`,
      "",
      "**Limitations**",
      "",
      ...q.limitations.map((l) => `- ${md(l)}`),
      "",
    );
  }

  if (data.notes?.length) {
    out.push("## Private notes (included at your request)", "", "_These are your own notes, not research findings._", "");
    for (const n of data.notes) out.push(`- ${md(n.content)} _(${fmtDate(n.createdAt)}${n.sectionType ? `, ${n.sectionType}` : ""})_`);
    out.push("");
  }

  out.push("## Sources", "", ...bibliographyMarkdown(cite.bibliography()), "");
  return out.join("\n");
}

export function briefMarkdown(args: {
  personName: string;
  objective: string;
  createdAt: string;
  brief: StoredMeetingBrief;
  claims: ClaimRow[];
  sources: SourceRecord[];
}): string {
  const cite = new CitationIndex(args.sources, args.claims);
  const b = args.brief;
  const out = [
    `# Meeting brief: ${md(args.personName)}`,
    "",
    `_Objective: ${md(args.objective)} · Generated ${fmtDate(args.createdAt)}_`,
    "",
    `> ${DISCLAIMER} You remain responsible for any decision.`,
    "",
  ];
  if (b.evidence_note) out.push(`> ${md(b.evidence_note)}`, "");
  out.push("## Executive summary", "", md(b.executive_summary), "");
  const block = (title: string, items: string[]) => {
    if (!items.length) return;
    out.push(`## ${title}`, "", ...items, "");
  };
  block("Key evidence-backed facts", b.key_facts.map((f) => `- ${md(f.fact)} ${cite.citeClaims(f.claim_ids)}`));
  block("Conversation topics", b.conversation_topics.map((t) => `- **${md(t.topic)}** — ${md(t.rationale)} ${cite.citeClaims(t.claim_ids)}`));
  block("Suggested questions", b.questions.map((q) => `- ${md(q.question)} _(${md(q.rationale)})_ ${cite.citeClaims(q.claim_ids)}`));
  block("Potential professional overlap", b.professional_overlap.map((p) => `- ${md(p.point)} ${cite.citeClaims(p.claim_ids)}`));
  block("Relevant recent developments", b.recent_developments.map((r) => `- ${md(r.summary)} ${cite.citeClaims(r.claim_ids)}`));
  block("Unknowns to clarify", b.unknowns_to_clarify.map((u) => `- ${md(u)}`));
  block("Documented business risks", b.documented_risks.map((r) => `- ${md(r.risk)} ${cite.citeClaims(r.claim_ids)}`));
  out.push("## Suggested opening", "", md(b.suggested_opening), "");
  block("Pre-meeting checklist", b.checklist.map((c) => `- [ ] ${md(c)}`));
  out.push("## Sources", "", ...bibliographyMarkdown(cite.bibliography()), "");
  return out.join("\n");
}
