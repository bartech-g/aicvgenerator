import type { Llm } from "../llm/client.js";
import type { AnecdoteBank } from "../schema/anecdotes.js";
import type { GapQuestions } from "../schema/artifacts.js";
import type { Resume } from "../schema/resume.js";

export type GapReply = { status: "yes" | "no" | "skipped"; text?: string };

/** The only interactive surface. Injected so tests can script answers. */
export type Asker = {
  gap(question: GapQuestions["questions"][number], index: number, total: number): Promise<GapReply>;
  select(message: string, choices: { name: string; value: string }[]): Promise<string>;
  input(message: string): Promise<string>;
  confirm(message: string): Promise<boolean>;
};

export type StageContext = {
  dir: string;
  llm: Llm;
  resume: Resume;
  anecdotes: AnecdoteBank;
  ask: Asker;
  /** Where to persist pending entries and new anecdotes. */
  resumePath: string;
  anecdotesPath: string;
  log: (line: string) => void;
};
