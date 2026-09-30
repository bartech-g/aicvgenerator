import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { EFFORT, MAX_TOKENS, STAGE_MODEL, supportsEffort, type LlmStage } from "../config.js";
import type { UsageRecord } from "../schema/artifacts.js";

export type StructuredRequest<T> = {
  stage: LlmStage;
  system: string;
  user: string;
  schema: z.ZodType<T>;
};

/** Every stage talks to the model through this signature, so tests can inject a fake. */
export type Llm = <T>(req: StructuredRequest<T>) => Promise<T>;

export class RefusalError extends Error {
  constructor(
    public readonly stage: LlmStage,
    public readonly category: string | null,
    public readonly explanation: string | null,
  ) {
    super(`Model refused during '${stage}' (category: ${category ?? "unknown"}): ${explanation ?? "no explanation"}`);
  }
}

export type UsageSink = (record: UsageRecord) => void;

export function createLlm(opts: { onUsage?: UsageSink; client?: Anthropic } = {}): Llm {
  const client = opts.client ?? new Anthropic();

  return async function callStructured<T>(req: StructuredRequest<T>): Promise<T> {
    let userText = req.user;
    let lastError: string | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const model = STAGE_MODEL[req.stage];
      const main = supportsEffort(model);
      const response = await client.beta.messages.parse({
        model,
        max_tokens: MAX_TOKENS,
        ...(main ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        output_config: { ...(main ? { effort: EFFORT[req.stage] } : {}), format: betaZodOutputFormat(req.schema) },
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userText }],
      });

      const fallbackUsed = (response.usage.iterations ?? []).some((it) => it.type === "fallback_message");
      opts.onUsage?.({
        stage: req.stage,
        model: response.model,
        at: new Date().toISOString(),
        inputTokens: response.usage.input_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
        outputTokens: response.usage.output_tokens,
        fallbackUsed,
      });

      if (response.stop_reason === "refusal") {
        throw new RefusalError(req.stage, response.stop_details?.category ?? null, response.stop_details?.explanation ?? null);
      }
      if (response.stop_reason === "max_tokens") {
        throw new Error(`Model hit max_tokens (${MAX_TOKENS}) during '${req.stage}'.`);
      }

      const parsed = response.parsed_output;
      if (parsed !== null && parsed !== undefined) {
        const check = req.schema.safeParse(parsed);
        if (check.success) return check.data;
        lastError = check.error.message;
      } else {
        lastError = "response did not contain parseable JSON";
      }
      userText = `${req.user}\n\nYour previous reply did not match the required schema: ${lastError}\nReply again, matching the schema exactly.`;
    }
    throw new Error(`Stage '${req.stage}' returned unparseable output twice. Last error: ${lastError}`);
  };
}

/** Wraps API errors into short messages the CLI can print. */
export function describeApiError(err: unknown): string {
  if (err instanceof RefusalError) return err.message;
  if (err instanceof Anthropic.AuthenticationError || (err instanceof Error && /Could not resolve authentication method/.test(err.message))) {
    return "No valid Anthropic credentials. Put ANTHROPIC_API_KEY in .env (see .env.example) or run `ant auth login`.";
  }
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the API. Wait a moment and re-run with --from <stage>.";
  if (err instanceof Anthropic.APIConnectionError) return `Could not reach the API: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `API error ${err.status ?? "?"}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
