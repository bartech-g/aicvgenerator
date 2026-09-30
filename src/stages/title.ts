import YAML from "yaml";
import { TITLE_SYSTEM } from "../llm/prompts/title.js";
import { analysisBlock, resumeBlock } from "../llm/prompts/shared.js";
import { type Analysis, type Title, TitleSuggestions } from "../schema/artifacts.js";
import type { StageContext } from "./context.js";

/** Suggests headlines for this posting and lets the candidate pick one, keep the current one, or type their own. */
export async function chooseTitle(ctx: StageContext, analysis: Analysis): Promise<Title> {
  const { suggestions } = await ctx.llm({
    stage: "title",
    system: TITLE_SYSTEM,
    user: [
      analysisBlock(JSON.stringify(analysis, null, 2)),
      resumeBlock(YAML.stringify(ctx.resume)),
      `Suggest headlines for "${analysis.position}" at ${analysis.company}. The resume's current headline is "${ctx.resume.basics.label ?? "(none)"}".`,
    ].join("\n\n"),
    schema: TitleSuggestions,
  });

  const current = ctx.resume.basics.label;
  const choices = [
    ...suggestions.map((s, i) => ({ name: `${s.title}  (${s.why})`, value: `s:${i}` })),
    ...(current ? [{ name: `Keep current: ${current}`, value: "keep" }] : []),
    { name: "Type my own", value: "custom" },
  ];
  const picked = await ctx.ask.select("Headline under your name for this application?", choices);

  if (picked === "keep" && current) return { title: current, source: "kept", suggestions };
  if (picked === "custom") {
    const typed = (await ctx.ask.input("Headline:")).trim();
    if (typed) return { title: typed, source: "custom", suggestions };
  }
  const s = suggestions[Number(picked.replace("s:", ""))] ?? suggestions[0];
  if (!s) throw new Error("The model returned no headline suggestions.");
  return { title: s.title, source: "suggested", suggestions };
}
