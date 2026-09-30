import path from "node:path";

export const STAGES = ["analyze", "gaps", "title", "tailor", "verify", "letter", "render"] as const;
export type Stage = (typeof STAGES)[number];

/** Stages that call the model, mapped to their effort level. */
export const LLM_STAGES = ["analyze", "gaps", "title", "tailor", "verify", "letter"] as const;
export type LlmStage = (typeof LLM_STAGES)[number];

export const MODEL = "claude-sonnet-5-5";
export const CHEAP_MODEL = "claude-haiku-4-5";

/** Extraction-style stages run on the cheap model. Verify stays on the main model: it is the fabrication gate. */
export const STAGE_MODEL: Record<LlmStage, string> = {
  analyze: CHEAP_MODEL,
  gaps: CHEAP_MODEL,
  title: CHEAP_MODEL,
  tailor: MODEL,
  verify: MODEL,
  letter: MODEL,
};

/** Haiku 4.5 rejects `effort` and the server-side refusal fallback; it takes neither. */
export const supportsEffort = (model: string) => !model.includes("haiku");

export const EFFORT: Record<LlmStage, "low" | "medium" | "high"> = {
  analyze: "low",
  gaps: "low",
  title: "low",
  tailor: "medium",
  verify: "low",
  letter: "medium",
};

export const MAX_TOKENS = 16000;

/** Anthropic first-party prices, USD per million tokens, for the notes cost table. */
const PRICES = {
  haiku: { input: 1, cacheRead: 0.1, cacheWrite: 1.25, output: 5 },
  sonnet: { input: 2, cacheRead: 0.2, cacheWrite: 2.5, output: 10 },
};
export const priceFor = (model: string) => (model.includes("haiku") ? PRICES.haiku : PRICES.sonnet);

export const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data");
export const APPLICATIONS_DIR = path.join(ROOT, "applications");
export const RESUME_PATH = path.join(DATA_DIR, "resume.yaml");
export const ANECDOTES_PATH = path.join(DATA_DIR, "anecdotes.yaml");

export const COVER_LETTER_WORDS = { min: 250, max: 350 };
export const COVER_LETTER_PARAGRAPHS = { min: 3, max: 4 };

/** Phrases that mark a letter as generic. Matched case-insensitively. */
export const BANNED_PHRASES = [
  "i am excited to apply",
  "i am writing to apply",
  "i am thrilled",
  "passionate about",
  "fast-paced environment",
  "team player",
  "proven track record",
  "results-driven",
  "hit the ground running",
  "synergy",
  "leverage my",
  "perfect fit",
  "dear hiring manager",
  "to whom it may concern",
];

export const ARTIFACTS = {
  posting: "job_posting.md",
  analysis: "analysis.json",
  gaps: "gaps.json",
  title: "title.json",
  tailored: "tailored.json",
  verification: "verification.json",
  tailoredVerified: "tailored.verified.json",
  coverLetter: "cover_letter.json",
  resumeMd: "resume.md",
  coverLetterMd: "cover_letter.md",
  notes: "notes.md",
  usage: "usage.jsonl",
} as const;
