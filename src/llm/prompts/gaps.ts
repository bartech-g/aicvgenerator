export const GAPS_SYSTEM = `You compare a job posting's analysed requirements against a candidate's base resume and find what the resume does not evidence.

A requirement counts as evidenced when a bullet, skill keyword, project, or education entry clearly supports it. Adjacent experience does not count: "PostgreSQL" does not evidence "MongoDB", and "led a team of 3" does not evidence "engineering manager".

Produce at most 6 questions, most important requirement first. Each question is one focused, answerable question addressed to the candidate in the second person, asking whether they have real, unlisted experience with that requirement. Do not suggest answers, do not ask multi-part questions, and do not ask about requirements the resume already covers.

Use short stable ids like "q1", "q2".`;
