import fs from "node:fs";
import path from "node:path";
import { ARTIFACTS, STAGES, type Stage } from "./config.js";
import { Analysis, CoverLetter, Gaps, Tailored, Title, Verification } from "./schema/artifacts.js";
import { createApplicationDir, hasArtifact, readJson, readText, readUsage, writeJson, writeText } from "./store/files.js";
import { analyze } from "./stages/analyze.js";
import type { StageContext } from "./stages/context.js";
import { askGaps, findGaps } from "./stages/gaps.js";
import { writeLetter } from "./stages/letter.js";
import { chooseTitle } from "./stages/title.js";
import { tailor } from "./stages/tailor.js";
import { verifyTailored } from "./stages/verify.js";
import { renderCoverLetterMarkdown, renderNotes, renderResumeMarkdown } from "./render/markdown.js";

export type PipelineOptions = {
  /** Raw posting text. Required when starting at 'analyze' in a new folder. */
  posting?: string;
  /** Existing application folder. Required when starting after 'analyze'. */
  dir?: string;
  from?: Stage;
  to?: Stage;
  applicationsRoot?: string;
  /** Called as soon as the application folder is known (after analyze creates it, or immediately when --dir is given). */
  onDir?: (dir: string) => void;
  ctx: Omit<StageContext, "dir">;
};

/** Which artifact each stage needs before it can run. */
const PREREQ: Record<Stage, (keyof typeof ARTIFACTS)[]> = {
  analyze: [],
  gaps: ["analysis"],
  title: ["analysis"],
  tailor: ["analysis", "gaps"],
  verify: ["tailored"],
  letter: ["analysis", "tailoredVerified"],
  render: ["analysis"],
};

/** The headline chosen in the title stage, if that stage has run for this application. */
function headline(dir: string): string | undefined {
  return hasArtifact(dir, "title") ? readJson(dir, "title", Title).title : undefined;
}

export async function runPipeline(opts: PipelineOptions): Promise<string> {
  const from = opts.from ?? "analyze";
  const to = opts.to ?? "render";
  const fromIdx = STAGES.indexOf(from);
  const toIdx = STAGES.indexOf(to);
  if (fromIdx > toIdx) throw new Error(`--from ${from} is after --to ${to}`);

  let dir = opts.dir;
  const log = opts.ctx.log;
  // Side data that later stages want in notes; recovered from disk when resuming.
  const extras: { tailorDropped?: string[] } = {};
  if (dir) opts.onDir?.(dir);

  for (const stage of STAGES.slice(fromIdx, toIdx + 1)) {
    if (stage === "analyze") {
      const posting = opts.posting ?? (dir && hasArtifact(dir, "posting") ? readText(dir, "posting") : undefined);
      if (!posting) throw new Error("analyze needs --posting <file|-> or an existing folder with job_posting.md");
      log("analyze: reading the posting");
      const analysis = await analyze(posting, opts.ctx.llm);
      if (!dir) dir = createApplicationDir(analysis.company, analysis.position, opts.applicationsRoot);
      fs.mkdirSync(dir, { recursive: true });
      opts.onDir?.(dir);
      writeText(dir, "posting", posting.endsWith("\n") ? posting : posting + "\n");
      writeJson(dir, "analysis", analysis);
      log(`analyze: ${analysis.position} at ${analysis.company} (${analysis.language}, ${analysis.seniority}) -> ${dir}`);
      continue;
    }

    if (!dir) throw new Error(`Stage '${stage}' needs --dir <application folder>`);
    for (const key of PREREQ[stage]) {
      if (!hasArtifact(dir, key)) throw new Error(`Stage '${stage}' needs ${ARTIFACTS[key]} in ${dir}. Run the earlier stage first.`);
    }
    const ctx: StageContext = { ...opts.ctx, dir };

    switch (stage) {
      case "gaps": {
        const analysis = readJson(dir, "analysis", Analysis);
        log("gaps: comparing requirements against your resume");
        const questions = await findGaps(ctx, analysis);
        log(questions.questions.length ? `gaps: ${questions.questions.length} question(s)` : "gaps: nothing missing");
        const gaps = await askGaps(ctx, questions);
        writeJson(dir, "gaps", gaps);
        break;
      }
      case "title": {
        const analysis = readJson(dir, "analysis", Analysis);
        log("title: suggesting headlines for this role");
        const title = await chooseTitle(ctx, analysis);
        writeJson(dir, "title", title);
        log(`title: "${title.title}" (${title.source})`);
        break;
      }
      case "tailor": {
        const analysis = readJson(dir, "analysis", Analysis);
        const gaps = readJson(dir, "gaps", Gaps);
        log("tailor: rewriting bullets for this posting");
        const { tailored, dropped } = await tailor(ctx, analysis, gaps, headline(dir));
        extras.tailorDropped = dropped;
        writeJson(dir, "tailored", tailored);
        if (dropped.length) log(`tailor: dropped ${dropped.length} invalid reference(s): ${dropped.join(", ")}`);
        break;
      }
      case "verify": {
        const tailored = readJson(dir, "tailored", Tailored);
        log("verify: checking every bullet against its source");
        const { verification, verified } = await verifyTailored(ctx, tailored);
        writeJson(dir, "verification", verification);
        writeJson(dir, "tailoredVerified", verified);
        log(`verify: ${verification.rejectedIds.length} bullet(s) reverted${verification.summaryRejected ? ", summary reverted" : ""}`);
        break;
      }
      case "letter": {
        const analysis = readJson(dir, "analysis", Analysis);
        const final = readJson(dir, "tailoredVerified", Tailored);
        log("letter: drafting");
        const letter = await writeLetter(ctx, analysis, final);
        writeJson(dir, "coverLetter", letter);
        log(`letter: ${letter.wordCount} words, anecdotes ${letter.anecdoteIdsUsed.join(", ")}`);
        break;
      }
      case "render": {
        const analysis = readJson(dir, "analysis", Analysis);
        const tailoredKey = (["tailoredVerified", "tailored"] as const).find((k) => hasArtifact(dir!, k));
        if (tailoredKey) writeText(dir, "resumeMd", renderResumeMarkdown(ctx.resume, readJson(dir, tailoredKey, Tailored), { label: headline(dir) }));
        const letter = hasArtifact(dir, "coverLetter") ? readJson(dir, "coverLetter", CoverLetter) : undefined;
        if (letter) writeText(dir, "coverLetterMd", renderCoverLetterMarkdown(letter));
        writeText(
          dir,
          "notes",
          renderNotes({
            analysis,
            gaps: hasArtifact(dir, "gaps") ? readJson(dir, "gaps", Gaps) : undefined,
            verification: hasArtifact(dir, "verification") ? readJson(dir, "verification", Verification) : undefined,
            letter,
            ...extras,
            usage: readUsage(dir),
          }),
        );
        log(`render: wrote ${path.relative(process.cwd(), dir)}/{${[tailoredKey && "resume.md", letter && "cover_letter.md", "notes.md"].filter(Boolean).join(",")}}`);
        break;
      }
    }
  }
  return dir!;
}
