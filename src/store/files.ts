import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { z } from "zod";
import { ANECDOTES_PATH, APPLICATIONS_DIR, ARTIFACTS, RESUME_PATH } from "../config.js";
import { AnecdoteBank } from "../schema/anecdotes.js";
import { assertUniqueIds, Resume } from "../schema/resume.js";
import { UsageRecord } from "../schema/artifacts.js";

export function loadResume(file = RESUME_PATH): Resume {
  const raw = YAML.parse(fs.readFileSync(file, "utf8"));
  const resume = Resume.parse(raw);
  assertUniqueIds(resume);
  return resume;
}

export function saveResume(resume: Resume, file = RESUME_PATH): void {
  fs.writeFileSync(file, YAML.stringify(resume, { lineWidth: 100 }));
}

export function loadAnecdotes(file = ANECDOTES_PATH): AnecdoteBank {
  if (!fs.existsSync(file)) return { anecdotes: [] };
  return AnecdoteBank.parse(YAML.parse(fs.readFileSync(file, "utf8")) ?? {});
}

export function saveAnecdotes(bank: AnecdoteBank, file = ANECDOTES_PATH): void {
  fs.writeFileSync(file, YAML.stringify(bank, { lineWidth: 100 }));
}

export function slug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "unknown";
}

export function applicationDirName(company: string, position: string, date = new Date()): string {
  return `${slug(company)}_${slug(position)}_${date.toISOString().slice(0, 10)}`;
}

export function createApplicationDir(company: string, position: string, root = APPLICATIONS_DIR): string {
  const dir = path.join(root, applicationDirName(company, position));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function artifactPath(dir: string, key: keyof typeof ARTIFACTS): string {
  return path.join(dir, ARTIFACTS[key]);
}

export function hasArtifact(dir: string, key: keyof typeof ARTIFACTS): boolean {
  return fs.existsSync(artifactPath(dir, key));
}

export function readJson<T>(dir: string, key: keyof typeof ARTIFACTS, schema: z.ZodType<T>): T {
  const file = artifactPath(dir, key);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${ARTIFACTS[key]} in ${dir}. Run the stage that produces it first.`);
  }
  return schema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

export function writeJson(dir: string, key: keyof typeof ARTIFACTS, value: unknown): void {
  fs.writeFileSync(artifactPath(dir, key), JSON.stringify(value, null, 2) + "\n");
}

export function readText(dir: string, key: keyof typeof ARTIFACTS): string {
  return fs.readFileSync(artifactPath(dir, key), "utf8");
}

export function writeText(dir: string, key: keyof typeof ARTIFACTS, value: string): void {
  fs.writeFileSync(artifactPath(dir, key), value);
}

export function appendUsage(dir: string, record: UsageRecord): void {
  fs.appendFileSync(artifactPath(dir, "usage"), JSON.stringify(record) + "\n");
}

export function readUsage(dir: string): UsageRecord[] {
  if (!hasArtifact(dir, "usage")) return [];
  return readText(dir, "usage")
    .split("\n")
    .filter(Boolean)
    .map((line) => UsageRecord.parse(JSON.parse(line)));
}
