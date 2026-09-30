import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import type { Llm, StructuredRequest } from "../src/llm/client.js";
import { AnecdoteBank } from "../src/schema/anecdotes.js";
import { Resume } from "../src/schema/resume.js";
import type { Asker, StageContext } from "../src/stages/context.js";

export const ROOT = path.resolve(import.meta.dirname, "..");

export function exampleResume(): Resume {
  return Resume.parse(YAML.parse(fs.readFileSync(path.join(ROOT, "data/resume.example.yaml"), "utf8")));
}
export function exampleAnecdotes(): AnecdoteBank {
  return AnecdoteBank.parse(YAML.parse(fs.readFileSync(path.join(ROOT, "data/anecdotes.example.yaml"), "utf8")));
}

/** Fake model: answers by stage, records every request. */
export function fakeLlm(answers: Partial<Record<string, unknown | ((req: StructuredRequest<unknown>) => unknown)>>) {
  const calls: StructuredRequest<unknown>[] = [];
  const llm: Llm = async (req) => {
    calls.push(req as StructuredRequest<unknown>);
    const a = answers[req.stage];
    if (a === undefined) throw new Error(`fakeLlm has no answer for stage ${req.stage}`);
    const value = typeof a === "function" ? (a as (r: StructuredRequest<unknown>) => unknown)(req as StructuredRequest<unknown>) : a;
    return req.schema.parse(value);
  };
  return { llm, calls };
}

export const silentAsker: Asker = {
  gap: async () => ({ status: "no" }),
  select: async (_m, c) => c[0]!.value,
  input: async () => "",
  confirm: async () => false,
};

export function tempCtx(overrides: Partial<Omit<StageContext, "dir">> = {}): Omit<StageContext, "dir"> & { tmp: string } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cvgen-"));
  const resumePath = path.join(tmp, "resume.yaml");
  const anecdotesPath = path.join(tmp, "anecdotes.yaml");
  fs.copyFileSync(path.join(ROOT, "data/resume.example.yaml"), resumePath);
  fs.copyFileSync(path.join(ROOT, "data/anecdotes.example.yaml"), anecdotesPath);
  return {
    tmp,
    llm: fakeLlm({}).llm,
    resume: exampleResume(),
    anecdotes: exampleAnecdotes(),
    ask: silentAsker,
    resumePath,
    anecdotesPath,
    log: () => {},
    ...overrides,
  };
}
