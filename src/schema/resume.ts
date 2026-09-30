import { z } from "zod";

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "ids are lowercase kebab-case");

export const Bullet = z.object({
  id,
  text: z.string().min(1),
  skills: z.array(z.string()).default([]),
  /** The quantified claim in this bullet, kept separate so it cannot drift. */
  metric: z.string().optional(),
});
export type Bullet = z.infer<typeof Bullet>;

export const Work = z.object({
  id,
  company: z.string(),
  position: z.string(),
  location: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  summary: z.string().optional(),
  bullets: z.array(Bullet).default([]),
});
export type Work = z.infer<typeof Work>;

export const Project = z.object({
  id,
  name: z.string(),
  description: z.string().optional(),
  url: z.string().optional(),
  bullets: z.array(Bullet).default([]),
});

export const Education = z.object({
  id,
  institution: z.string(),
  area: z.string().optional(),
  studyType: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const SkillGroup = z.object({
  name: z.string(),
  keywords: z.array(z.string()).default([]),
});

export const PendingEntry = z.object({
  id,
  text: z.string(),
  skills: z.array(z.string()).default([]),
  source: z.string(),
  date: z.string(),
  /** Which work/project entry this belongs to, if the user said. */
  attachTo: z.string().optional(),
});
export type PendingEntry = z.infer<typeof PendingEntry>;

export const Resume = z.object({
  basics: z.object({
    name: z.string(),
    label: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    url: z.string().optional(),
    summary: z.string().optional(),
    profiles: z.array(z.object({ network: z.string(), url: z.string() })).default([]),
  }),
  work: z.array(Work).default([]),
  projects: z.array(Project).default([]),
  education: z.array(Education).default([]),
  skills: z.array(SkillGroup).default([]),
  languages: z.array(z.object({ language: z.string(), fluency: z.string() })).default([]),
  /** Gap-check answers the user has not yet folded into the sections above. */
  pending: z.array(PendingEntry).default([]),
});
export type Resume = z.infer<typeof Resume>;

/** Every bullet the tailor is allowed to reference, keyed by id, with its section. */
export type BulletSource = {
  id: string;
  text: string;
  metric?: string;
  skills: string[];
  sectionId: string;
  sectionLabel: string;
};

export function bulletSources(resume: Resume): Map<string, BulletSource> {
  const out = new Map<string, BulletSource>();
  for (const w of resume.work) {
    for (const b of w.bullets) {
      out.set(b.id, {
        id: b.id,
        text: b.text,
        metric: b.metric,
        skills: b.skills,
        sectionId: w.id,
        sectionLabel: `${w.position} at ${w.company}`,
      });
    }
  }
  for (const p of resume.projects) {
    for (const b of p.bullets) {
      out.set(b.id, { id: b.id, text: b.text, metric: b.metric, skills: b.skills, sectionId: p.id, sectionLabel: p.name });
    }
  }
  for (const p of resume.pending) {
    out.set(p.id, {
      id: p.id,
      text: p.text,
      skills: p.skills,
      sectionId: p.attachTo ?? "pending",
      sectionLabel: p.attachTo ?? "Pending (unmerged gap-check answers)",
    });
  }
  return out;
}

export function assertUniqueIds(resume: Resume): void {
  const seen = new Set<string>();
  const check = (x: string) => {
    if (seen.has(x)) throw new Error(`Duplicate id in resume: ${x}`);
    seen.add(x);
  };
  for (const w of resume.work) {
    check(w.id);
    w.bullets.forEach((b) => check(b.id));
  }
  for (const p of resume.projects) {
    check(p.id);
    p.bullets.forEach((b) => check(b.id));
  }
  resume.education.forEach((e) => check(e.id));
  resume.pending.forEach((p) => check(p.id));
}
