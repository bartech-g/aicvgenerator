import path from "node:path";
import YAML from "yaml";
import { GAPS_SYSTEM } from "../llm/prompts/gaps.js";
import { analysisBlock, resumeBlock } from "../llm/prompts/shared.js";
import { type Analysis, GapQuestions, type Gaps } from "../schema/artifacts.js";
import type { PendingEntry } from "../schema/resume.js";
import { saveAnecdotes, saveResume } from "../store/files.js";
import type { StageContext } from "./context.js";

function nextId(prefix: string, existing: string[]): string {
  let n = 1;
  while (existing.includes(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

export async function findGaps(ctx: StageContext, analysis: Analysis): Promise<GapQuestions> {
  return ctx.llm({
    stage: "gaps",
    system: GAPS_SYSTEM,
    user: [
      analysisBlock(JSON.stringify(analysis, null, 2)),
      resumeBlock(YAML.stringify(ctx.resume)),
      "List the requirements this resume does not evidence, as questions to the candidate.",
    ].join("\n\n"),
    schema: GapQuestions,
  });
}

/** Asks each question, records answers, and persists "yes" answers as pending resume entries. */
export async function askGaps(ctx: StageContext, questions: GapQuestions): Promise<Gaps> {
  const answers: Gaps["answers"] = [];
  const total = questions.questions.length;
  const source = path.basename(ctx.dir);
  const today = new Date().toISOString().slice(0, 10);

  for (const [i, q] of questions.questions.entries()) {
    const reply = await ctx.ask.gap(q, i + 1, total);
    if (reply.status !== "yes" || !reply.text?.trim()) {
      answers.push({ questionId: q.id, status: reply.status === "yes" ? "skipped" : reply.status });
      continue;
    }

    const attachChoices = [
      ...ctx.resume.work.map((w) => ({ name: `${w.position} at ${w.company}`, value: w.id })),
      ...ctx.resume.projects.map((p) => ({ name: `Project: ${p.name}`, value: p.id })),
      { name: "None of these", value: "" },
    ];
    const attachTo = await ctx.ask.select("Which entry does this experience belong to?", attachChoices);

    const pendingId = nextId("pending", ctx.resume.pending.map((p) => p.id));
    const entry: PendingEntry = {
      id: pendingId,
      text: reply.text.trim(),
      skills: [q.requirement],
      source,
      date: today,
      ...(attachTo ? { attachTo } : {}),
    };
    ctx.resume.pending.push(entry);
    saveResume(ctx.resume, ctx.resumePath);
    ctx.log(`Saved to resume.yaml under pending as ${pendingId}. Merge it into a section when you are happy with the wording.`);

    let anecdoteId: string | undefined;
    if (await ctx.ask.confirm("Save this as an anecdote for cover letters too?")) {
      const result = await ctx.ask.input("What was the outcome? (one sentence, blank to cancel)");
      if (result.trim()) {
        anecdoteId = nextId("anecdote", ctx.anecdotes.anecdotes.map((a) => a.id));
        ctx.anecdotes.anecdotes.push({
          id: anecdoteId,
          title: q.requirement,
          situation: `Asked while applying for ${source}: ${q.question}`,
          action: reply.text.trim(),
          result: result.trim(),
          skills: [q.requirement],
        });
        saveAnecdotes(ctx.anecdotes, ctx.anecdotesPath);
        ctx.log(`Saved anecdote ${anecdoteId}.`);
      }
    }

    answers.push({ questionId: q.id, status: "yes", text: reply.text.trim(), pendingId, anecdoteId });
  }

  return { questions: questions.questions, answers };
}
