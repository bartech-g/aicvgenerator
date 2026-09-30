import { priceFor } from "../config.js";
import type { Analysis, CoverLetter, Gaps, Tailored, UsageRecord, Verification } from "../schema/artifacts.js";
import { bulletSources, type Resume } from "../schema/resume.js";

function dates(start?: string, end?: string): string {
  if (!start && !end) return "";
  return `${start ?? ""} – ${end ?? "present"}`;
}

export function renderResumeMarkdown(resume: Resume, tailored: Tailored, opts: { withIds?: boolean; label?: string } = {}): string {
  const b = resume.basics;
  const sources = bulletSources(resume);
  const tag = (id: string) => (opts.withIds ? ` <!-- ${id} -->` : "");
  const link = (label: string, url: string) => `[${label}](${url})`;
  const contact = [
    b.email,
    b.phone,
    b.location,
    b.url && link("Website", b.url),
    ...b.profiles.map((p) => link(p.network, p.url)),
  ]
    .filter(Boolean)
    .join(" · ");
  const out: string[] = [`# ${b.name}`];
  const label = opts.label ?? b.label;
  if (label) out.push(`**${label}**`);
  if (contact) out.push(contact);
  if (tailored.summary) out.push("", "## Summary", "", tailored.summary);

  const sectionMap = new Map(tailored.sections.map((s) => [s.sourceSectionId, s.bullets]));
  const pendingBullets = sectionMap.get("pending") ?? [];

  const workLines: string[] = [];
  for (const w of resume.work) {
    const bullets = [
      ...(sectionMap.get(w.id) ?? []),
      ...pendingBullets.filter((pb) => sources.get(pb.sourceId)?.sectionId === w.id),
    ];
    if (bullets.length === 0) continue;
    workLines.push("", `### ${w.position}, ${w.company}`, [dates(w.startDate, w.endDate), w.location].filter(Boolean).join(" · "));
    if (w.summary) workLines.push("", w.summary);
    workLines.push("");
    for (const bl of bullets) workLines.push(`- ${bl.newText}${tag(bl.sourceId)}`);
  }
  if (workLines.length) out.push("", "## Experience", ...workLines);

  const projectLines: string[] = [];
  for (const p of resume.projects) {
    const bullets = sectionMap.get(p.id) ?? [];
    if (bullets.length === 0) continue;
    projectLines.push("", `### ${p.name}${p.url ? ` (${p.url})` : ""}`);
    if (p.description) projectLines.push("", p.description);
    projectLines.push("");
    for (const bl of bullets) projectLines.push(`- ${bl.newText}${tag(bl.sourceId)}`);
  }
  if (projectLines.length) out.push("", "## Projects", ...projectLines);

  if (tailored.skillsOrder.length) out.push("", "## Skills", "", tailored.skillsOrder.join(" · "));

  if (resume.education.length) {
    out.push("", "## Education");
    for (const e of resume.education) {
      out.push("", `**${[e.studyType, e.area].filter(Boolean).join(" in ")}**, ${e.institution}`, dates(e.startDate, e.endDate));
    }
  }
  if (resume.languages.length) {
    out.push("", "## Languages", "", resume.languages.map((l) => `${l.language} (${l.fluency})`).join(" · "));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

export function renderCoverLetterMarkdown(letter: CoverLetter): string {
  return letter.paragraphs.join("\n\n") + "\n";
}

export function costUsd(u: UsageRecord[]): number {
  return u.reduce((sum, r) => {
    const p = priceFor(r.model);
    return (
      sum +
      (r.inputTokens * p.input + r.cacheReadTokens * p.cacheRead + r.cacheWriteTokens * p.cacheWrite + r.outputTokens * p.output) / 1e6
    );
  }, 0);
}

export function renderNotes(input: {
  analysis: Analysis;
  gaps?: Gaps;
  verification?: Verification;
  letter?: CoverLetter;
  tailorDropped?: string[];
  usage: UsageRecord[];
}): string {
  const { analysis, gaps, verification, letter, usage } = input;
  const out: string[] = [`# Notes: ${analysis.position} at ${analysis.company}`, "", "Status: drafted", ""];

  out.push("## Keywords targeted", "", analysis.keywords.map((k) => `- ${k}`).join("\n") || "- (none)", "");
  out.push("## Required skills", "", analysis.requiredSkills.map((k) => `- ${k}`).join("\n") || "- (none)", "");
  if (analysis.redFlags.length) out.push("## Red flags in the posting", "", analysis.redFlags.map((k) => `- ${k}`).join("\n"), "");

  if (gaps) {
    out.push("## Gap check", "");
    if (gaps.questions.length === 0) out.push("No gaps found.", "");
    for (const q of gaps.questions) {
      const a = gaps.answers.find((x) => x.questionId === q.id);
      out.push(`- **${q.requirement}**: ${q.question}`);
      out.push(`  - Answer: ${a?.status ?? "unanswered"}${a?.text ? ` — ${a.text}` : ""}${a?.pendingId ? ` (saved as ${a.pendingId})` : ""}`);
    }
    out.push("");
  }

  const verifySection = (title: string, v: Verification) => {
    out.push(`## ${title}`, "");
    if (v.rejectedIds.length === 0 && !v.summaryRejected) out.push("All bullets and the summary passed.", "");
    for (const b of v.bullets.filter((b) => !b.ok)) out.push(`- ${b.sourceId} reverted to source text: ${b.issues.join("; ")}`);
    if (v.summaryRejected) out.push(`- Summary reverted to base summary: ${v.summary.issues.join("; ")}`);
    out.push("");
  };
  if (input.tailorDropped?.length) out.push("## Dropped by sanitizer (model referenced unknown ids)", "", input.tailorDropped.map((d) => `- ${d}`).join("\n"), "");
  if (verification) verifySection("Verification (after tailoring)", verification);


  if (letter) {
    out.push("## Cover letter", "", `- Words: ${letter.wordCount}`, `- Anecdotes used: ${letter.anecdoteIdsUsed.join(", ") || "none"}`);
    out.push(`- Banned phrases found: ${letter.bannedPhrasesFound.length ? letter.bannedPhrasesFound.join(", ") : "none"}`, "");
  }

  if (usage.length) {
    out.push("## API usage", "", "| stage | model | input | cache read | cache write | output | fallback |", "|---|---|---:|---:|---:|---:|---|");
    for (const u of usage) {
      out.push(`| ${u.stage} | ${u.model} | ${u.inputTokens} | ${u.cacheReadTokens} | ${u.cacheWriteTokens} | ${u.outputTokens} | ${u.fallbackUsed ? "yes" : ""} |`);
    }
    out.push("", `Estimated cost: $${costUsd(usage).toFixed(3)} (first-party list prices)`, "");
  }
  return out.join("\n");
}
