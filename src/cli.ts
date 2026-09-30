import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Command, Option } from "commander";
import { confirm, input, select } from "@inquirer/prompts";
import { ANECDOTES_PATH, APPLICATIONS_DIR, RESUME_PATH, STAGES, type Stage } from "./config.js";
import { createLlm, describeApiError } from "./llm/client.js";
import { runPipeline } from "./pipeline.js";
import type { Asker } from "./stages/context.js";
import type { UsageRecord } from "./schema/artifacts.js";
import { letterDocx, resumeDocx, writeDocx } from "./render/docx.js";
import { htmlToPdf, letterHtml, resumeHtml } from "./render/pdf.js";
import { appendUsage, loadAnecdotes, loadResume } from "./store/files.js";

const terminalAsker: Asker = {
  async gap(q, i, total) {
    console.log(`\n[${i}/${total}] ${q.requirement}\n   ${q.whyMissing}\n`);
    const status = await select({
      message: q.question,
      choices: [
        { name: "Yes, I have relevant experience (describe it)", value: "yes" },
        { name: "No", value: "no" },
        { name: "Skip", value: "skipped" },
      ],
    });
    if (status !== "yes") return { status: status as "no" | "skipped" };
    const text = await input({ message: "Describe it in one or two sentences, as it should appear on the resume:" });
    return { status: "yes", text };
  },
  select: (message, choices) => select({ message, choices }),
  input: (message) => input({ message }),
  confirm: (message) => confirm({ message, default: false }),
};

function readPosting(src: string): string {
  if (src === "-") return fs.readFileSync(0, "utf8");
  return fs.readFileSync(path.resolve(src), "utf8");
}

async function execute(opts: { posting?: string; dir?: string; from?: Stage; to?: Stage; resume: string; anecdotes: string }) {
  const resume = loadResume(opts.resume);
  const anecdotes = loadAnecdotes(opts.anecdotes);
  let currentDir = opts.dir ? path.resolve(opts.dir) : undefined;
  const pendingUsage: UsageRecord[] = [];
  const llm = createLlm({
    onUsage: (u) => (currentDir ? appendUsage(currentDir, u) : pendingUsage.push(u)),
  });

  try {
    const dir = await runPipeline({
      posting: opts.posting ? readPosting(opts.posting) : undefined,
      dir: currentDir,
      from: opts.from,
      to: opts.to,
      onDir: (d) => {
        currentDir = d;
        pendingUsage.splice(0).forEach((u) => appendUsage(d, u));
      },
      ctx: {
        llm,
        resume,
        anecdotes,
        ask: terminalAsker,
        resumePath: opts.resume,
        anecdotesPath: opts.anecdotes,
        log: (line) => console.log(line),
      },
    });
    console.log(`\nDone. Review the package in ${path.relative(process.cwd(), dir)}`);
  } catch (err) {
    console.error(`\nError: ${describeApiError(err)}`);
    process.exitCode = 1;
  }
}

function latestApplicationDir(): string {
  const root = APPLICATIONS_DIR;
  const dirs = fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()) : [];
  const newest = dirs.map((d) => ({ p: path.join(root, d.name), t: fs.statSync(path.join(root, d.name)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
  if (!newest) throw new Error("no application folders found; pass --dir");
  return newest.p;
}

const program = new Command().name("cv").description("Tailor a resume and write a cover letter for one job posting");
const common = (c: Command) =>
  c
    .option("--resume <path>", "base resume YAML", RESUME_PATH)
    .option("--anecdotes <path>", "anecdote bank YAML", ANECDOTES_PATH);

common(
  program
    .command("run")
    .description("Run the whole pipeline (or part of it with --from/--to)")
    .option("-p, --posting <file|->", "job posting text file, or - for stdin")
    .option("-d, --dir <folder>", "existing application folder (required with --from past analyze)")
    .addOption(new Option("--from <stage>", "start at this stage").choices([...STAGES]))
    .addOption(new Option("--to <stage>", "stop after this stage").choices([...STAGES])),
).action((o) => execute(o));

for (const stage of STAGES) {
  const cmd = program.command(stage).description(`Run only the '${stage}' stage`);
  if (stage === "analyze") cmd.option("-p, --posting <file|->", "job posting text file, or - for stdin");
  cmd.option("-d, --dir <folder>", "application folder");
  common(cmd).action((o) => execute({ ...o, from: stage, to: stage }));
}

common(
  program
    .command("pdf")
    .description("Render resume.md and cover_letter.md in an application folder to PDF")
    .option("-d, --dir <folder>", "application folder (default: the most recent one)"),
).action(async (o) => {
  try {
    const dir = o.dir ? path.resolve(o.dir) : latestApplicationDir();
    const resume = loadResume(o.resume);
    const jobs: { html: string; out: string }[] = [];
    const rmd = path.join(dir, "resume.md");
    const lmd = path.join(dir, "cover_letter.md");
    if (fs.existsSync(rmd)) jobs.push({ html: resumeHtml(fs.readFileSync(rmd, "utf8")), out: path.join(dir, "resume.pdf") });
    if (fs.existsSync(lmd)) jobs.push({ html: letterHtml(fs.readFileSync(lmd, "utf8"), resume), out: path.join(dir, "cover_letter.pdf") });
    if (!jobs.length) throw new Error(`no resume.md or cover_letter.md in ${dir}; run the render stage first`);
    await htmlToPdf(jobs);
    for (const j of jobs) console.log(`wrote ${path.relative(process.cwd(), j.out)}`);
  } catch (err) {
    console.error(`\nError: ${describeApiError(err)}`);
    process.exitCode = 1;
  }
});

common(
  program
    .command("docx")
    .description("Render resume.md and cover_letter.md in an application folder to editable Word files")
    .option("-d, --dir <folder>", "application folder (default: the most recent one)"),
).action(async (o) => {
  try {
    const dir = o.dir ? path.resolve(o.dir) : latestApplicationDir();
    const resume = loadResume(o.resume);
    const rmd = path.join(dir, "resume.md");
    const lmd = path.join(dir, "cover_letter.md");
    if (!fs.existsSync(rmd) && !fs.existsSync(lmd)) throw new Error(`no resume.md or cover_letter.md in ${dir}; run the render stage first`);
    if (fs.existsSync(rmd)) await writeDocx(resumeDocx(fs.readFileSync(rmd, "utf8")), path.join(dir, "resume.docx"));
    if (fs.existsSync(lmd)) await writeDocx(letterDocx(fs.readFileSync(lmd, "utf8"), resume), path.join(dir, "cover_letter.docx"));
    for (const f of ["resume.docx", "cover_letter.docx"]) if (fs.existsSync(path.join(dir, f))) console.log(`wrote ${path.relative(process.cwd(), path.join(dir, f))}`);
  } catch (err) {
    console.error(`\nError: ${describeApiError(err)}`);
    process.exitCode = 1;
  }
});

program.parseAsync(process.argv);
