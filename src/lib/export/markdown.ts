import en, { type Messages } from "@/i18n/messages/en";
import type { ProfileSectionType } from "@/lib/ai/schemas";
import type { StoredMeetingBrief } from "@/lib/research/meeting";
import type { StoredInterestTopic, StoredRecentItem, StoredValueItem, VisualStyleContent } from "@/lib/research/profile";
import type { ClaimRow, QualityReport, SectionRow } from "@/lib/research/store";
import type { SourceRecord } from "@/lib/research/types";
import { isPurpose } from "@/lib/validation/schemas";
import { CitationIndex } from "./citations";

/**
 * Markdown exports. Uncertainty labels, caveats and source links are always
 * included; private notes only when the user explicitly opts in. Labels follow
 * the viewer's language; source text, names and quotes are never translated.
 */

/** Escapes characters that could turn source-controlled text into Markdown/HTML markup. */
export function md(text: string | null | undefined): string {
  return (text ?? "").replace(/[\\`*_{}[\]<>#|]/g, (c) => `\\${c}`).replace(/\r?\n/g, " ");
}

const fmtDate = (d: string | null | undefined, t: Messages = en) => (d ? d.slice(0, 10) : t.exportMd.dateUnknown);

/** Brief objectives are stored as purpose keys (older briefs: English labels). */
export function objectiveLabel(objective: string, t: Messages = en): string {
  return isPurpose(objective) ? t.purposes[objective] : objective;
}

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

function sectionBody(section: SectionRow, cite: CitationIndex, t: Messages): string[] {
  const x = t.exportMd;
  const S = t.sections;
  const c = section.content as Record<string, unknown>;
  const lines: string[] = [];
  const list = (items: Cited[] | undefined, heading?: string) => {
    if (!items?.length) return;
    if (heading) lines.push(`**${heading}**`, "");
    for (const i of items) lines.push(`- ${md(i.text)} ${cite.citeClaims(i.claim_ids)}`);
    lines.push("");
  };
  if (section.userOverride) {
    lines.push(`> **${x.editedByYou(fmtDate(section.userOverrideAt, t))}**: ${md(section.userOverride)}`, "");
  }
  if (typeof c.summary === "string") lines.push(md(c.summary), "");

  switch (section.sectionType) {
    case "overview": {
      const role = c.current_role as Cited | null;
      lines.push(role ? `**${x.currentRoleVerified}** ${md(role.text)} ${cite.citeClaims(role.claim_ids)}` : `**${x.currentRoleNot}**`, "");
      list(c.key_points as Cited[], S.keyPoints);
      break;
    }
    case "background": {
      const positions = (c.positions as Array<{ title: string; organization: string; period: string | null; status: string; claim_ids: string[] }>) ?? [];
      if (positions.length) {
        lines.push(`**${x.positions}**`, "");
        for (const p of positions) {
          lines.push(`- ${md(p.title)}, ${md(p.organization)}${p.period ? ` (${md(p.period)})` : ""} — ${p.status === "current" ? S.currentVerified : p.status === "historical" ? S.historical : S.statusUnknown} ${cite.citeClaims(p.claim_ids)}`);
        }
        lines.push("");
      }
      list(c.education as Cited[], S.education);
      list(c.achievements as Cited[], S.achievements);
      list(c.publications as Cited[], S.publications);
      list(c.projects as Cited[], S.projects);
      break;
    }
    case "interests":
      for (const topic of (c.topics as StoredInterestTopic[]) ?? []) {
        lines.push(
          `- **${md(topic.topic)}** — ${md(topic.description)} (${topic.recurring ? x.recurring(topic.source_count) : x.singleMention}${topic.most_recent_date ? `, ${x.mostRecent(topic.most_recent_date)}` : ""}) ${cite.citeSources(topic.source_ids)}`,
        );
      }
      lines.push("");
      break;
    case "communication":
      for (const o of (c.observations as Array<{ dimension: string; observation: string; source_ids: string[] }>) ?? []) {
        lines.push(`- _${md(S.dimensions[o.dimension as keyof typeof S.dimensions] ?? o.dimension)}_: ${md(o.observation)} ${cite.citeSources(o.source_ids)}`);
      }
      lines.push("");
      break;
    case "values":
      for (const v of (c.items as StoredValueItem[]) ?? []) {
        const body = v.kind === "direct_quote" && v.quote ? `“${md(v.quote)}” (${x.directQuote})` : `${md(v.idea)} (${x.paraphrase})`;
        lines.push(`- ${body} ${cite.citeSources([v.source_id])}${v.note ? ` — ${md(v.note)}` : ""}`);
      }
      lines.push("");
      break;
    case "relationships":
      for (const r of (c.items as Array<{ counterpart: string; relationship: string; description: string; claim_ids: string[] }>) ?? []) {
        lines.push(`- ${md(r.counterpart)} — ${S.relationshipTypes[r.relationship as keyof typeof S.relationshipTypes] ?? r.relationship.replace(/_/g, " ")}: ${md(r.description)} ${cite.citeClaims(r.claim_ids)}`);
      }
      lines.push("");
      break;
    case "recent":
      for (const r of (c.items as StoredRecentItem[]) ?? []) {
        lines.push(
          `- ${md(r.summary)} — ${x.published(fmtDate(r.published_at, t))}${r.reported_event_date ? `; ${x.eventDate(md(r.reported_event_date))}` : ""}. ${x.whyItMatters} ${md(r.why_it_may_matter)} ${cite.citeSources([r.source_id])}`,
        );
      }
      lines.push("");
      break;
    case "visual_style":
      lines.push(md((c as unknown as VisualStyleContent).reason), "");
      break;
    case "open_questions": {
      const group = (key: keyof typeof S.openQuestions) => {
        const label = S.openQuestions[key];
        const items = (c[key] as string[]) ?? [];
        if (!items.length) return;
        lines.push(`**${label}**`, "", ...items.map((i) => `- ${md(i)}`), "");
      };
      group("missing_information");
      group("conflicting_information");
      group("needs_verification");
      group("insufficient_evidence_areas");
      group("questions_to_ask");
      break;
    }
  }
  const limitations = c.limitations as string[] | undefined;
  if (limitations?.length) lines.push(`_${x.limitations}_`, ...limitations.map((l) => `- ${md(l)}`), "");
  return lines;
}

const SECTION_ORDER: ProfileSectionType[] = ["overview", "background", "interests", "communication", "visual_style", "values", "relationships", "recent", "open_questions"];

export function bibliographyMarkdown(sources: SourceRecord[], numbered = true, t: Messages = en): string[] {
  const x = t.exportMd;
  return sources.map((s, i) => {
    const prefix = numbered ? `${i + 1}. ` : "- ";
    const retrieval = t.explorers.retrieval[s.retrievalStatus as keyof typeof t.explorers.retrieval] ?? s.retrievalStatus;
    const status = s.retrievalStatus === "retrieved" ? x.fullPage : s.retrievalStatus === "snippet_only" ? x.snippetOnly : x.notRetrieved(retrieval);
    return `${prefix}${md(s.title ?? s.domain)} — <${s.url}> · ${t.sourceTypes[s.sourceType]} · ${x.published(fmtDate(s.publishedAt, t))} · ${x.accessed(fmtDate(s.accessedAt, t))} · ${status}`;
  });
}

export function profileMarkdown(data: ProfileExportData, part: "profile" | "report", t: Messages = en): string {
  const x = t.exportMd;
  const cite = new CitationIndex(data.sources, data.claims);
  const out: string[] = [
    `# ${md(data.personName)} — ${part === "report" ? x.researchReport : x.profileSummary}`,
    "",
    `_${x.lastResearched(fmtDate(data.lastResearchedAt, t), new Date().toISOString().slice(0, 10))}_`,
    "",
    `> ${x.disclaimer}`,
    "",
  ];
  const sections = new Map(data.sections.map((s) => [s.sectionType, s]));
  const order: ProfileSectionType[] = part === "profile" ? ["overview", "background", "interests", "recent", "open_questions"] : SECTION_ORDER;
  for (const type of order) {
    const s = sections.get(type);
    if (!s) continue;
    out.push(`## ${t.sectionLabels[type]}`, "", ...sectionBody(s, cite, t));
  }

  if (part === "report" && data.claims.length) {
    out.push(`## ${t.sections.evidenceTitle}`, "");
    for (const c of data.claims) {
      out.push(
        `- ${md(c.claimText)} — **${t.evidence.confidence[c.confidenceLabel]}** (${t.evidence.verification[c.verificationStatus]}; ${t.evidence.types[c.evidenceType]}). ${md(c.confidenceRationale)} ${cite.citeClaims([c.id])}${c.limitations ? ` _${md(c.limitations)}_` : ""}`,
      );
    }
    out.push("");
  }

  if (data.quality) {
    const q = data.quality;
    out.push(
      `## ${t.sections.qualityTitle}`,
      "",
      `- ${x.qualitySources(q.sourcesFound, q.sourcesRetrieved, q.sourcesSnippetOnly, q.sourcesNotPermitted, q.sourcesFailed, q.sourcesUnrelated)}`,
      `- ${x.qualityClaims(q.claimsExtracted, q.claimsRejected)}`,
      `- ${x.qualityConflicts(q.conflicts.length ? q.conflicts.map((c) => md(c.description)).join("; ") : x.noneDetected)}`,
      `- ${x.qualityInsufficient(q.insufficientSections.length ? q.insufficientSections.map((s) => t.sectionLabels[s as ProfileSectionType] ?? s).join(", ") : x.none)}`,
      "",
      `**${t.sections.limitations}**`,
      "",
      ...q.limitations.map((l) => `- ${md(l)}`),
      "",
    );
  }

  if (data.notes?.length) {
    out.push(`## ${x.notesTitle}`, "", `_${x.notesNote}_`, "");
    for (const n of data.notes) out.push(`- ${md(n.content)} _(${fmtDate(n.createdAt, t)}${n.sectionType ? `, ${t.sectionLabels[n.sectionType as ProfileSectionType] ?? n.sectionType}` : ""})_`);
    out.push("");
  }

  out.push(`## ${t.report.sources}`, "", ...bibliographyMarkdown(cite.bibliography(), true, t), "");
  return out.join("\n");
}

export function briefMarkdown(args: {
  personName: string;
  objective: string;
  createdAt: string;
  brief: StoredMeetingBrief;
  claims: ClaimRow[];
  sources: SourceRecord[];
  t?: Messages;
}): string {
  const t = args.t ?? en;
  const x = t.exportMd;
  const B = t.brief.blocks;
  const cite = new CitationIndex(args.sources, args.claims);
  const b = args.brief;
  const out = [
    `# ${x.briefTitle(md(args.personName))}`,
    "",
    `_${x.briefMeta(md(objectiveLabel(args.objective, t)), fmtDate(args.createdAt, t))}_`,
    "",
    `> ${x.disclaimer} ${x.responsibility}`,
    "",
  ];
  if (b.evidence_note) out.push(`> ${md(b.evidence_note)}`, "");
  out.push(`## ${x.executiveSummary}`, "", md(b.executive_summary), "");
  const block = (title: string, items: string[]) => {
    if (!items.length) return;
    out.push(`## ${title}`, "", ...items, "");
  };
  block(B.facts, b.key_facts.map((f) => `- ${md(f.fact)} ${cite.citeClaims(f.claim_ids)}`));
  block(B.topics, b.conversation_topics.map((c) => `- **${md(c.topic)}** — ${md(c.rationale)} ${cite.citeClaims(c.claim_ids)}`));
  block(B.questions, b.questions.map((q) => `- ${md(q.question)} _(${md(q.rationale)})_ ${cite.citeClaims(q.claim_ids)}`));
  block(B.overlap, b.professional_overlap.map((p) => `- ${md(p.point)} ${cite.citeClaims(p.claim_ids)}`));
  block(B.recent, b.recent_developments.map((r) => `- ${md(r.summary)} ${cite.citeClaims(r.claim_ids)}`));
  block(B.unknowns, b.unknowns_to_clarify.map((u) => `- ${md(u)}`));
  block(B.risks, b.documented_risks.map((r) => `- ${md(r.risk)} ${cite.citeClaims(r.claim_ids)}`));
  out.push(`## ${B.opening}`, "", md(b.suggested_opening), "");
  block(B.checklist, b.checklist.map((c) => `- [ ] ${md(c)}`));
  out.push(`## ${t.report.sources}`, "", ...bibliographyMarkdown(cite.bibliography(), true, t), "");
  return out.join("\n");
}
