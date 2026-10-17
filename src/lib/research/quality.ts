import { SECTION_LABELS, type ProfileSectionType } from "@/lib/ai/schemas";
import type { ConfidenceLabel } from "./evidence";
import type { ClaimRow, QualityReport } from "./store";
import type { SourceRecord } from "./types";

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
}): QualityReport {
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
    limitations.push("No full pages could be retrieved; findings rely on search snippets only.");
  } else if (relevant.length > 0 && retrieved / relevant.length < 0.3) {
    limitations.push("Most sources were analysed from search snippets only.");
  }
  if (!sourceCategories.personal_website && !sourceCategories.company_website) {
    limitations.push("No primary source (the person's own or their organization's website) was found.");
  }
  if (args.claims.length > 0 && claimsByConfidence.high === 0) {
    limitations.push("No claim reached high confidence; treat findings as leads to verify.");
  }
  if (args.claimsRejected > 0) {
    limitations.push(`${args.claimsRejected} proposed claim${args.claimsRejected === 1 ? " was" : "s were"} discarded because the supporting text could not be found in the cited source.`);
  }
  if (args.queriesFailed > 0) {
    limitations.push(`${args.queriesFailed} search quer${args.queriesFailed === 1 ? "y" : "ies"} failed.`);
  }
  limitations.push(
    "Coverage is limited to what the configured search provider returns. Social networks and login-protected pages are not searched directly, and completeness is not guaranteed.",
  );

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
    insufficientSections: args.insufficientSections.map((s) => SECTION_LABELS[s as ProfileSectionType] ?? s),
    limitations,
    unavailableProviders: args.unavailableProviders,
    reliesOnSnippetsOnly: relevant.length > 0 && retrieved === 0,
  };
}
