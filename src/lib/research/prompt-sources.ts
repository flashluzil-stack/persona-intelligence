import type { PromptSource } from "@/lib/ai/prompts";
import type { SourceRecord } from "./types";

/**
 * Maps stored sources to short prompt references (S1, S2, ...) and bounds the
 * amount of text sent to the model.
 */
export interface SourceRefMap {
  prompt: PromptSource[];
  byRef: Map<string, SourceRecord>;
}

export function buildSourceRefs(sources: SourceRecord[], totalCharBudget = 100_000, perSourceMax = 6_000): SourceRefMap {
  const perSource = Math.max(800, Math.min(perSourceMax, Math.floor(totalCharBudget / Math.max(1, sources.length))));
  const byRef = new Map<string, SourceRecord>();
  const prompt: PromptSource[] = sources.map((s, i) => {
    const ref = `S${i + 1}`;
    byRef.set(ref, s);
    const body = s.contentText
      ? s.contentText.slice(0, perSource)
      : `(Search snippet only — full page not retrieved)\n${s.excerpt ?? ""}`;
    return {
      ref,
      title: s.title,
      domain: s.domain,
      sourceType: s.sourceType,
      publishedAt: s.publishedAt,
      text: body,
    };
  });
  return { prompt, byRef };
}

/** Full text available for evidence verification (content plus snippet). */
export function verifiableText(source: SourceRecord): string {
  return [source.title ?? "", source.excerpt ?? "", source.contentText ?? ""].join("\n");
}
