export const NO_FABRICATION = `Hard rule: never invent experience, employers, titles, dates, tools, technologies, numbers, or outcomes that are not in the material you are given. If the material does not support a claim, leave the claim out.`;

export function resumeBlock(resumeYaml: string): string {
  return `<base_resume format="yaml">\n${resumeYaml}\n</base_resume>`;
}

export function postingBlock(posting: string): string {
  return `<job_posting>\n${posting}\n</job_posting>`;
}

export function analysisBlock(analysisJson: string): string {
  return `<posting_analysis format="json">\n${analysisJson}\n</posting_analysis>`;
}
