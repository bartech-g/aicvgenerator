import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runPipeline } from "../src/pipeline.js";
import type { Asker } from "../src/stages/context.js";
import { fakeLlm, tempCtx } from "./helpers.js";

const posting = `Senior Backend Engineer at Acme Corp. We need Go, PostgreSQL and Kafka experience. You will own the payments ledger. Remote in Poland.`;

const analysis = {
  company: "Acme Corp",
  position: "Senior Backend Engineer",
  language: "en",
  seniority: "senior",
  requiredSkills: ["Go", "PostgreSQL", "Kafka"],
  preferredSkills: [],
  keywords: ["Go", "PostgreSQL", "Kafka", "ledger"],
  tone: "terse",
  responsibilities: ["own the payments ledger"],
  redFlags: [],
};

const okTailored = {
  summary: "Backend engineer focused on ledgers in Go.",
  sections: [
    { sourceSectionId: "work-finpay", bullets: [{ sourceId: "finpay-1", newText: "Built a Go ledger service handling 1.2M transactions per day." }] },
    { sourceSectionId: "work-shoply", bullets: [{ sourceId: "shoply-1", newText: "Built the order pipeline in TypeScript." }] },
  ],
  skillsOrder: ["Go", "PostgreSQL"],
};

const okVerify = (req: { user: string }) => {
  const ids = [...req.user.matchAll(/"sourceId": "([^"]+)"/g)].map((m) => m[1]);
  return { bullets: ids.map((sourceId) => ({ sourceId, ok: true, issues: [] })), summary: { ok: true, issues: [] } };
};

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

function fullFake(kafkaAnswer: "yes" | "no") {
  const { llm, calls } = fakeLlm({
    analyze: analysis,
    gaps: { questions: [{ id: "q1", requirement: "Kafka", whyMissing: "not in resume", question: "Have you used Kafka in production?" }] },
    title: { suggestions: [{ title: "Payments Backend Engineer", why: "FinPay ledger work" }, { title: "Backend Engineer", why: "Shoply" }] },
    tailor: (req: { user: string }) => (kafkaAnswer === "yes" && /pending-1/.test(req.user) ? { ...okTailored, sections: [...okTailored.sections, { sourceSectionId: "work-finpay", bullets: [{ sourceId: "pending-1", newText: "Ran Kafka consumers for settlement events." }] }] } : okTailored),
    verify: okVerify,
    letter: { language: "en", paragraphs: [words(90), words(90), words(90)], anecdoteIdsUsed: ["ledger-migration"] },
  });
  return { llm, calls };
}

describe("runPipeline", () => {
  it("runs end to end with a fake model and writes every artifact", async () => {
    const { llm, calls } = fullFake("no");
    const base = tempCtx({ llm });
    const dir = await runPipeline({ posting, applicationsRoot: path.join(base.tmp, "apps"), ctx: base });

    expect(path.basename(dir)).toMatch(/^acme-corp_senior-backend-engineer_\d{4}-\d{2}-\d{2}$/);
    for (const f of ["job_posting.md", "analysis.json", "gaps.json", "tailored.json", "verification.json", "tailored.verified.json", "cover_letter.json", "resume.md", "cover_letter.md", "notes.md"]) {
      expect(fs.existsSync(path.join(dir, f)), f).toBe(true);
    }
    expect(calls.map((c) => c.stage)).toEqual(["analyze", "gaps", "title", "tailor", "verify", "letter"]);
    const finalResume = fs.readFileSync(path.join(dir, "resume.md"), "utf8");
    expect(finalResume).toContain("Built the order pipeline in TypeScript.");
    expect(finalResume).toContain("**Payments Backend Engineer**");
    expect(fs.existsSync(path.join(dir, "title.json"))).toBe(true);
    expect(finalResume).not.toContain("Kafka");
    expect(fs.readFileSync(path.join(dir, "notes.md"), "utf8")).toContain("Answer: no");
  });

  it("stores a 'yes' gap answer as a pending entry and makes it available to the tailor", async () => {
    const { llm } = fullFake("yes");
    const yesAsker: Asker = {
      gap: async () => ({ status: "yes", text: "Ran Kafka consumers for settlement events at FinPay." }),
      select: async (_m, c) => (c.find((x) => x.value === "work-finpay") ?? c[0]!).value,
      input: async () => "Zero lost events over a year.",
      confirm: async () => true,
    };
    const base = tempCtx({ llm, ask: yesAsker });
    const dir = await runPipeline({ posting, applicationsRoot: path.join(base.tmp, "apps"), ctx: base });

    expect(fs.readFileSync(base.resumePath, "utf8")).toMatch(/pending:\n  - id: pending-1/);
    expect(fs.readFileSync(base.anecdotesPath, "utf8")).toContain("id: anecdote-1");
    const md = fs.readFileSync(path.join(dir, "resume.md"), "utf8");
    expect(md).toContain("Kafka consumers");
    expect(md.indexOf("Kafka consumers")).toBeLessThan(md.indexOf("Shoply"));
  });

  it("resumes from a later stage and refuses when prerequisites are missing", async () => {
    const { llm, calls } = fullFake("no");
    const base = tempCtx({ llm });
    const dir = await runPipeline({ posting, to: "tailor", applicationsRoot: path.join(base.tmp, "apps"), ctx: base });
    expect(calls.map((c) => c.stage)).toEqual(["analyze", "gaps", "title", "tailor"]);

    await expect(runPipeline({ dir, from: "letter", ctx: base })).rejects.toThrow(/needs tailored.verified.json/);

    await runPipeline({ dir, from: "verify", ctx: base });
    expect(calls.map((c) => c.stage).slice(4)).toEqual(["verify", "letter"]);
    expect(fs.existsSync(path.join(dir, "cover_letter.md"))).toBe(true);
  });

  it("retries the letter once and then fails loudly", async () => {
    const { llm } = fakeLlm({
      analyze: analysis,
      gaps: { questions: [] },
      title: { suggestions: [{ title: "Backend Engineer", why: "x" }] },
      tailor: okTailored,
      verify: okVerify,
      letter: { language: "en", paragraphs: [words(20)], anecdoteIdsUsed: [] },
    });
    const base = tempCtx({ llm });
    await expect(runPipeline({ posting, applicationsRoot: path.join(base.tmp, "apps"), ctx: base })).rejects.toThrow(/failed validation twice/);
  });
});
