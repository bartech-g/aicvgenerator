import YAML from "yaml";
import type { z } from "zod";
import { BANNED_PHRASES, COVER_LETTER_PARAGRAPHS, COVER_LETTER_WORDS } from "../config.js";
import { LETTER_SYSTEM } from "../llm/prompts/letter.js";
import { analysisBlock } from "../llm/prompts/shared.js";
import { type Analysis, type CoverLetter, LlmCoverLetter, type Tailored } from "../schema/artifacts.js";
import { renderResumeMarkdown } from "../render/markdown.js";
import type { StageContext } from "./context.js";

export function wordCount(paragraphs: string[]): number {
  return paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
}

export function bannedPhrasesIn(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_PHRASES.filter((p) => lower.includes(p));
}

/** Violations that force a retry. Banned phrases are reported but do not block. */
type LetterDraft = z.infer<typeof LlmCoverLetter>;

export function hardViolations(letter: LetterDraft, knownAnecdoteIds: Set<string>): string[] {
  const v: string[] = [];
  const words = wordCount(letter.paragraphs);
  if (words < COVER_LETTER_WORDS.min || words > COVER_LETTER_WORDS.max) {
    v.push(`length is ${words} words; must be ${COVER_LETTER_WORDS.min}-${COVER_LETTER_WORDS.max}`);
  }
  if (letter.paragraphs.length < COVER_LETTER_PARAGRAPHS.min || letter.paragraphs.length > COVER_LETTER_PARAGRAPHS.max) {
    v.push(`has ${letter.paragraphs.length} paragraphs; must be ${COVER_LETTER_PARAGRAPHS.min}-${COVER_LETTER_PARAGRAPHS.max}`);
  }
  const used = letter.anecdoteIdsUsed.filter((id) => knownAnecdoteIds.has(id));
  if (used.length === 0) v.push("uses no anecdote from the bank; anecdoteIdsUsed must name at least one existing id");
  return v;
}

export async function writeLetter(ctx: StageContext, analysis: Analysis, tailored: Tailored): Promise<CoverLetter> {
  if (ctx.anecdotes.anecdotes.length === 0) {
    throw new Error("The anecdote bank is empty. Add at least one anecdote to data/anecdotes.yaml before writing a letter.");
  }
  const known = new Set(ctx.anecdotes.anecdotes.map((a) => a.id));
  const base = [
    analysisBlock(JSON.stringify(analysis, null, 2)),
    `<tailored_resume format="markdown">\n${renderResumeMarkdown(ctx.resume, tailored)}\n</tailored_resume>`,
    `<anecdote_bank format="yaml">\n${YAML.stringify(ctx.anecdotes)}\n</anecdote_bank>`,
    `Write the cover letter in language "${analysis.language}".`,
  ].join("\n\n");

  let user = base;
  let last: LetterDraft | null = null;
  let violations: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    last = await ctx.llm({ stage: "letter", system: LETTER_SYSTEM, user, schema: LlmCoverLetter });
    violations = hardViolations(last, known);
    if (violations.length === 0) break;
    user = `${base}\n\nYour previous draft was rejected: ${violations.join("; ")}. Write it again.`;
  }
  if (!last) throw new Error("unreachable");
  if (violations.length) throw new Error(`Cover letter failed validation twice: ${violations.join("; ")}`);

  return {
    ...last,
    anecdoteIdsUsed: last.anecdoteIdsUsed.filter((id) => known.has(id)),
    wordCount: wordCount(last.paragraphs),
    bannedPhrasesFound: bannedPhrasesIn(last.paragraphs.join("\n")),
  };
}
