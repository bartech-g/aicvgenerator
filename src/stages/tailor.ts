import YAML from "yaml";
import { analysisBlock, resumeBlock } from "../llm/prompts/shared.js";
import { TAILOR_SYSTEM } from "../llm/prompts/tailor.js";
import { type Analysis, type Gaps, Tailored } from "../schema/artifacts.js";
import { bulletSources, type Resume } from "../schema/resume.js";
import type { StageContext } from "./context.js";

function gapAnswersBlock(gaps: Gaps): string {
  const lines = gaps.answers
    .filter((a) => a.status === "yes" && a.text)
    .map((a) => {
      const q = gaps.questions.find((q) => q.id === a.questionId);
      return `- ${q?.requirement ?? a.questionId}: ${a.text} (available as bullet id ${a.pendingId})`;
    });
  const nos = gaps.answers
    .filter((a) => a.status !== "yes")
    .map((a) => gaps.questions.find((q) => q.id === a.questionId)?.requirement)
    .filter(Boolean);
  return [
    "<gap_check>",
    lines.length ? "Candidate confirmed these unlisted experiences:\n" + lines.join("\n") : "Candidate confirmed no additional experience.",
    nos.length ? `Candidate does NOT have: ${nos.join("; ")}. Do not imply otherwise.` : "",
    "</gap_check>",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Removes anything the model referenced that does not exist, and guarantees one bullet per work entry. */
export function sanitizeTailored(tailored: Tailored, resume: Resume): { tailored: Tailored; dropped: string[] } {
  const sources = bulletSources(resume);
  const dropped: string[] = [];
  const seen = new Set<string>();
  const sectionIds = new Set([...resume.work.map((w) => w.id), ...resume.projects.map((p) => p.id), "pending"]);

  const sections = tailored.sections
    .filter((s) => sectionIds.has(s.sourceSectionId) || dropped.push(`section ${s.sourceSectionId}`) < 0)
    .map((s) => ({
      sourceSectionId: s.sourceSectionId,
      bullets: s.bullets.flatMap((b) => {
        const usable = (id: string) => {
          const src = sources.get(id);
          return !!src && !seen.has(id) && (src.sectionId === s.sourceSectionId || src.sectionId === "pending");
        };
        if (!usable(b.sourceId)) {
          dropped.push(`bullet ${b.sourceId}`);
          return [];
        }
        seen.add(b.sourceId);
        const mergedIds = (b.mergedIds ?? []).filter((id) => {
          const ok = id !== b.sourceId && usable(id);
          if (!ok) dropped.push(`merged bullet ${id}`);
          else seen.add(id);
          return ok;
        });
        return [mergedIds.length ? { sourceId: b.sourceId, newText: b.newText, mergedIds } : { sourceId: b.sourceId, newText: b.newText }];
      }),
    }));

  for (const w of resume.work) {
    const existing = sections.find((s) => s.sourceSectionId === w.id);
    const first = w.bullets[0];
    if (!first) continue;
    if (!existing) sections.push({ sourceSectionId: w.id, bullets: [{ sourceId: first.id, newText: first.text }] });
    else if (existing.bullets.length === 0 && !seen.has(first.id)) existing.bullets.push({ sourceId: first.id, newText: first.text });
  }

  const keywords = new Map(resume.skills.flatMap((g) => g.keywords).map((k) => [k.toLowerCase(), k]));
  const skillsOrder: string[] = [];
  for (const k of tailored.skillsOrder) {
    const canonical = keywords.get(k.toLowerCase());
    if (canonical && !skillsOrder.includes(canonical)) skillsOrder.push(canonical);
    else if (!canonical) dropped.push(`skill ${k}`);
  }
  for (const k of keywords.values()) if (!skillsOrder.includes(k)) skillsOrder.push(k);

  return { tailored: { summary: tailored.summary, sections, skillsOrder }, dropped };
}

export async function tailor(ctx: StageContext, analysis: Analysis, gaps: Gaps, headline?: string): Promise<{ tailored: Tailored; dropped: string[] }> {
  const sources = bulletSources(ctx.resume);
  const idList = [...sources.values()].map((s) => `- ${s.id} (${s.sectionId}: ${s.sectionLabel})`).join("\n");
  const raw = await ctx.llm({
    stage: "tailor",
    system: TAILOR_SYSTEM,
    user: [
      analysisBlock(JSON.stringify(analysis, null, 2)),
      resumeBlock(YAML.stringify(ctx.resume)),
      gapAnswersBlock(gaps),
      headline ? `<headline>\n${headline}\n</headline>\nThe resume shows this headline under the candidate's name. Write the summary so it fits it and this role; do not contradict it.` : "",
      `<valid_bullet_ids>\n${idList}\n</valid_bullet_ids>`,
      `Write the tailored resume in language "${analysis.language}". Reference only ids from valid_bullet_ids, each at most once, under its own section id (pending bullets may go under the section they belong to).`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    schema: Tailored,
  });
  return sanitizeTailored(raw, ctx.resume);
}
