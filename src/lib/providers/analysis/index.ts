import { getAnalysisProviderConfig, getResearchLimits } from "@/lib/config";
import { OpenAIStructuredModel, type StructuredModel } from "./openai";

/** Returns the configured analysis model, or null when AI analysis is not configured. */
export function createAnalysisModel(): StructuredModel | null {
  const cfg = getAnalysisProviderConfig();
  if (!cfg) return null;
  const limits = getResearchLimits();
  // Structured generation of a whole profile can take longer than a search call.
  return new OpenAIStructuredModel(cfg, { retries: limits.maxRetries, timeoutMs: Math.max(limits.providerTimeoutMs, 120_000) });
}
