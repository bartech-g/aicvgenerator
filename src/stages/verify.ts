import YAML from "yaml";
import { VERIFY_SYSTEM } from "../llm/prompts/verify.js";
import { LlmVerification, type Tailored, type Verification } from "../schema/artifacts.js";
import { bulletSources, type Resume } from "../schema/resume.js";
import type { StageContext } from "./context.js";

/** Numeric tokens in a string, normalised so "1,200" and "1200" compare equal. */
export function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d[\d,.]*\d|\d/g)) {
    out.add(m[0].replace(/[,.](?=\d{3}\b)/g, "").replace(/[.,]$/, ""));
  }
  return out;
}

/** Code-only check: no number may appear in newText unless it is in the source text or metric. */
export function numericIssues(newText: string, sourceText: string, metric?: string): string[] {
  const allowed = numbersIn(`${sourceText} ${metric ?? ""}`);
  return [...numbersIn(newText)].filter((n) => !allowed.has(n)).map((n) => `introduces number "${n}" not in source`);
}

export async function verifyTailored(
  ctx: StageContext,
  tailored: Tailored,
): Promise<{ verification: Verification; verified: Tailored }> {
  const sources = bulletSources(ctx.resume);
  const resumeYaml = YAML.stringify(ctx.resume);
  const pairs = tailored.sections.flatMap((s) =>
    s.bullets.map((b) => {
      const all = [b.sourceId, ...(b.mergedIds ?? [])].map((id) => sources.get(id)!);
      return {
        sourceId: b.sourceId,
        sourceText: all.map((a) => a.text).join(" | "),
        metric: all.map((a) => a.metric).filter(Boolean).join("; ") || undefined,
        newText: b.newText,
      };
    }),
  );

  const codeIssues = new Map<string, string[]>();
  for (const p of pairs) {
    const issues = numericIssues(p.newText, p.sourceText, p.metric);
    if (issues.length) codeIssues.set(p.sourceId, issues);
  }
  const summaryCodeIssues = [...numbersIn(tailored.summary)]
    .filter((n) => !numbersIn(resumeYaml).has(n))
    .map((n) => `summary introduces number "${n}" not in resume`);

  const llm = await ctx.llm({
    stage: "verify",
    system: VERIFY_SYSTEM,
    user: [
      `<pairs format="json">\n${JSON.stringify(pairs, null, 2)}\n</pairs>`,
      `<summary>\n${tailored.summary}\n</summary>`,
      `<base_resume format="yaml">\n${resumeYaml}\n</base_resume>`,
      "Check every pair and the summary. Return one entry per sourceId, in the same order.",
    ].join("\n\n"),
    schema: LlmVerification,
  });

  const llmById = new Map(llm.bullets.map((b) => [b.sourceId, b]));
  const bullets = pairs.map((p) => {
    const fromLlm = llmById.get(p.sourceId);
    const issues = [...(codeIssues.get(p.sourceId) ?? []), ...(fromLlm?.ok === false ? fromLlm.issues : [])];
    return { sourceId: p.sourceId, ok: issues.length === 0, issues };
  });
  const summaryIssues = [...summaryCodeIssues, ...(llm.summary.ok ? [] : llm.summary.issues)];
  const rejectedIds = bullets.filter((b) => !b.ok).map((b) => b.sourceId);
  const summaryRejected = summaryIssues.length > 0;

  const verified: Tailored = {
    summary: summaryRejected ? (ctx.resume.basics.summary ?? "") : tailored.summary,
    sections: tailored.sections.map((s) => ({
      sourceSectionId: s.sourceSectionId,
      // A rejected bullet reverts to its source text; a rejected merge falls back to its separate source bullets.
      bullets: s.bullets.flatMap((b) =>
        rejectedIds.includes(b.sourceId)
          ? [b.sourceId, ...(b.mergedIds ?? [])].map((id) => ({ sourceId: id, newText: sources.get(id)!.text }))
          : [b],
      ),
    })),
    skillsOrder: tailored.skillsOrder,
  };

  return {
    verification: { bullets, summary: { ok: !summaryRejected, issues: summaryIssues }, rejectedIds, summaryRejected },
    verified,
  };
}
