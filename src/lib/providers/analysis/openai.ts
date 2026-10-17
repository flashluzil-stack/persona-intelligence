import { z } from "zod";
import { errorFromStatus, withRetries } from "@/lib/providers/http";
import { ProviderError, type UsageRecord } from "@/lib/research/types";

export interface StructuredRequest<T extends z.ZodType> {
  name: string;
  system: string;
  user: string;
  schema: T;
  maxOutputTokens?: number;
}

export interface StructuredResult<T> {
  data: T;
  usage: UsageRecord;
  model: string;
}

/** Abstract LLM transport; the analysis service depends only on this. */
export interface StructuredModel {
  readonly id: string;
  readonly model: string;
  generate<T extends z.ZodType>(req: StructuredRequest<T>, signal?: AbortSignal): Promise<StructuredResult<z.infer<T>>>;
}

const chatResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable(), refusal: z.string().nullable().optional() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).optional(),
});

/**
 * OpenAI Chat Completions with JSON-schema structured output. The response is
 * always re-validated with Zod; on invalid output we retry once with the
 * validation error fed back, then fail with a structured ProviderError.
 */
export class OpenAIStructuredModel implements StructuredModel {
  readonly id = "openai";

  constructor(
    private readonly cfg: { apiKey: string; model: string; baseUrl: string },
    private readonly opts: { retries: number; timeoutMs: number; fetchImpl?: typeof fetch },
  ) {}

  get model() {
    return this.cfg.model;
  }

  async generate<T extends z.ZodType>(req: StructuredRequest<T>, signal?: AbortSignal): Promise<StructuredResult<z.infer<T>>> {
    const jsonSchema = z.toJSONSchema(req.schema, { target: "draft-7", io: "output" });
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ];
    let inputTokens = 0;
    let outputTokens = 0;

    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await withRetries(
        async (s) => {
          const res = await (this.opts.fetchImpl ?? fetch)(`${this.cfg.baseUrl}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.cfg.apiKey}` },
            body: JSON.stringify({
              model: this.cfg.model,
              messages,
              max_completion_tokens: req.maxOutputTokens ?? 8000,
              response_format: {
                type: "json_schema",
                json_schema: { name: req.name, schema: jsonSchema, strict: false },
              },
            }),
            signal: s,
          });
          if (!res.ok) throw errorFromStatus("OpenAI", res.status);
          return res.json();
        },
        { retries: this.opts.retries, timeoutMs: this.opts.timeoutMs, provider: "OpenAI", signal },
      );
      const parsedResponse = chatResponseSchema.safeParse(raw);
      if (!parsedResponse.success) throw new ProviderError("OpenAI", "bad_response", "Unexpected response format");
      inputTokens += parsedResponse.data.usage?.prompt_tokens ?? 0;
      outputTokens += parsedResponse.data.usage?.completion_tokens ?? 0;
      const choice = parsedResponse.data.choices[0];
      if (choice.message.refusal) {
        throw new ProviderError("OpenAI", "invalid_output", "The model declined to produce this analysis");
      }
      const content = choice.message.content ?? "";
      let json: unknown;
      let problem: string;
      try {
        json = JSON.parse(content);
        const validated = req.schema.safeParse(json);
        if (validated.success) {
          return {
            data: validated.data,
            model: this.cfg.model,
            usage: { kind: "ai_call", provider: "openai", units: attempt + 1, inputTokens, outputTokens },
          };
        }
        problem = z.prettifyError(validated.error).slice(0, 2000);
      } catch {
        problem = choice.finish_reason === "length" ? "Output was truncated." : "Output was not valid JSON.";
      }
      messages.push({ role: "assistant", content: content.slice(0, 20_000) });
      messages.push({
        role: "user",
        content: `Your previous output did not match the required schema:\n${problem}\nReturn corrected JSON only.`,
      });
    }
    throw new ProviderError("OpenAI", "invalid_output", "The model returned output that failed validation");
  }
}
