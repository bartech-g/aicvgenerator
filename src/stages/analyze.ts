import type { Llm } from "../llm/client.js";
import { ANALYZE_SYSTEM } from "../llm/prompts/analyze.js";
import { postingBlock } from "../llm/prompts/shared.js";
import { Analysis } from "../schema/artifacts.js";

export async function analyze(posting: string, llm: Llm): Promise<Analysis> {
  const trimmed = posting.trim();
  if (trimmed.length < 50) throw new Error("The posting text is too short to analyse.");
  return llm({
    stage: "analyze",
    system: ANALYZE_SYSTEM,
    user: `${postingBlock(trimmed)}\n\nAnalyse this posting.`,
    schema: Analysis,
  });
}
