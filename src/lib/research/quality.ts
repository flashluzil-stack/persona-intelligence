import { SECTION_LABELS, type ProfileSectionType } from "@/lib/ai/schemas";
import type { ConfidenceLabel } from "./evidence";
import type { ClaimRow, QualityReport } from "./store";
import en from "@/i18n/messages/en";
import type { EngineMessages, SourceRecord } from "./types";

/**
 * Research quality summary. Deliberately a set of counts and plain-language
 * limitations — never a single score claiming how well we "know" a person.
 */
export function buildQualityReport(args: {
  sources: SourceRecord[];
  claims: ClaimRow[];
  claimsRejected: number;
  conflicts: Array<{ key: string; description: string }>;
  insufficientSections: string[];
  queriesRun: number;
  queriesFailed: number;
  warnings: string[];
  unavailableProviders: string[];
  profileGenerated: boolean;
  messages?: EngineMessages;
  sectionLabels?: Record<string, string>;
}): QualityReport {
  const m = (args.messages ?? en.engine).quality;
  const labels = args.sectionLabels ?? SECTION_LABELS;
  const relevant = args.sources.filter((s) => s.relevance !== "unrelated");
  const count = (status: SourceRecord["retrievalStatus"]) => relevant.filter((s) => s.retrievalStatus === status).length;
  const sourceCategories: Record<string, number> = {};
  for (const s of relevant) sourceCategories[s.sourceType] = (sourceCategories[s.sourceType] ?? 0) + 1;
  const claimsByConfidence: Record<ConfidenceLabel, number> = { high: 0, moderate: 0, low: 0, insufficient: 0 };
  for (const c of args.claims) claimsByConfidence[c.confidenceLabel]++;

  const citedSourceIds = new Set(args.claims.flatMap((c) => c.evidence.map((e) => e.sourceId)));
  const retrieved = count("retrieved");
  const limitations = [...args.warnings];
  if (relevant.length > 0 && retrieved === 0) {
    limitations.push(m.snippetsOnly);
  } else if (relevant.length > 0 && retrieved / relevant.length < 0.3) {
    limitations.push(m.mostlySnippets);
  }
  if (!sourceCategories.personal_website && !sourceCategories.company_website) {
    limitations.push(m.noPrimary);
  }
  if (args.claims.length > 0 && claimsByConfidence.high === 0) {
    limitations.push(m.noHigh);
  }
  if (args.claimsRejected > 0) {
    limitations.push(m.rejected(args.claimsRejected));
  }
  if (args.queriesFailed > 0) {
    limitations.push(m.queriesFailed(args.queriesFailed));
  }
  limitations.push(m.coverage);

  return {
    sourcesFound: args.sources.length,
    sourcesRetrieved: retrieved,
    sourcesSnippetOnly: count("snippet_only"),
    sourcesNotPermitted: count("not_permitted") + count("blocked"),
    sourcesFailed: count("failed"),
    sourcesAnalysed: citedSourceIds.size,
    sourcesUnrelated: args.sources.length - relevant.length,
    sourceCategories,
    queriesRun: args.queriesRun,
    queriesFailed: args.queriesFailed,
    claimsExtracted: args.claims.length,
    claimsRejected: args.claimsRejected,
    claimsByConfidence,
    conflicts: args.conflicts,
    insufficientSections: args.insufficientSections.map((s) => labels[s as ProfileSectionType] ?? s),
    limitations,
    unavailableProviders: args.unavailableProviders,
    reliesOnSnippetsOnly: relevant.length > 0 && retrieved === 0,
  };
}
