import { z } from "zod";

// ---- analyze ----
export const Analysis = z.object({
  company: z.string().describe("Employer name as written in the posting, or 'Unknown'"),
  position: z.string().describe("Job title as written in the posting"),
  language: z.string().describe("BCP-47 code of the posting language, e.g. 'en' or 'pl'"),
  seniority: z.enum(["intern", "junior", "mid", "senior", "lead", "principal", "manager", "unspecified"]),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  keywords: z.array(z.string()).describe("Exact terms an ATS or recruiter would search for"),
  tone: z.string().describe("One sentence on how the posting is written"),
  responsibilities: z.array(z.string()),
  redFlags: z.array(z.string()).describe("Anything in the posting the candidate should notice before applying"),
});
export type Analysis = z.infer<typeof Analysis>;

// ---- gaps ----
export const GapQuestion = z.object({
  id: z.string(),
  requirement: z.string().describe("The skill or experience from the posting"),
  whyMissing: z.string().describe("Why the base resume does not evidence it"),
  question: z.string().describe("One focused question to the candidate"),
});
export const GapQuestions = z.object({ questions: z.array(GapQuestion) });
export type GapQuestions = z.infer<typeof GapQuestions>;

export const GapAnswer = z.object({
  questionId: z.string(),
  status: z.enum(["yes", "no", "skipped"]),
  text: z.string().optional(),
  pendingId: z.string().optional(),
  anecdoteId: z.string().optional(),
});
export const Gaps = GapQuestions.extend({ answers: z.array(GapAnswer) });
export type Gaps = z.infer<typeof Gaps>;

// ---- title ----
export const TitleSuggestions = z.object({
  suggestions: z
    .array(z.object({ title: z.string().describe("Headline shown under the name on the resume"), why: z.string().describe("Which resume experience supports it") }))
    .describe("3 or 4 candidate headlines, best first"),
});
export type TitleSuggestions = z.infer<typeof TitleSuggestions>;
export const Title = z.object({
  title: z.string(),
  source: z.enum(["suggested", "kept", "custom"]),
  suggestions: TitleSuggestions.shape.suggestions,
});
export type Title = z.infer<typeof Title>;

// ---- tailor ----
export const TailoredBullet = z.object({
  sourceId: z.string().describe("id of the base resume bullet this is derived from"),
  newText: z.string(),
  mergedIds: z
    .array(z.string())
    .optional()
    .describe("ids of further bullets from the same section that newText also covers because it merges them into sourceId's bullet"),
});
export const TailoredSection = z.object({
  sourceSectionId: z.string().describe("id of the work or project entry"),
  bullets: z.array(TailoredBullet),
});
export const Tailored = z.object({
  summary: z.string().describe("Rewritten professional summary for this posting"),
  sections: z.array(TailoredSection),
  skillsOrder: z.array(z.string()).describe("Skill keywords from the resume, most relevant first"),
});
export type Tailored = z.infer<typeof Tailored>;

// ---- verify ----
export const VerificationItem = z.object({
  sourceId: z.string(),
  ok: z.boolean(),
  issues: z.array(z.string()),
});
export const LlmVerification = z.object({
  bullets: z.array(VerificationItem),
  summary: z.object({ ok: z.boolean(), issues: z.array(z.string()) }),
});
export const Verification = LlmVerification.extend({
  /** Bullets that were replaced by their source text. */
  rejectedIds: z.array(z.string()),
  summaryRejected: z.boolean(),
});
export type Verification = z.infer<typeof Verification>;

// ---- letter ----
export const LlmCoverLetter = z.object({
  language: z.string(),
  paragraphs: z.array(z.string()),
  anecdoteIdsUsed: z.array(z.string()),
});
export const CoverLetter = LlmCoverLetter.extend({
  wordCount: z.number(),
  bannedPhrasesFound: z.array(z.string()),
});
export type CoverLetter = z.infer<typeof CoverLetter>;

// ---- usage log ----
export const UsageRecord = z.object({
  stage: z.string(),
  model: z.string(),
  at: z.string(),
  inputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  outputTokens: z.number(),
  fallbackUsed: z.boolean(),
});
export type UsageRecord = z.infer<typeof UsageRecord>;
