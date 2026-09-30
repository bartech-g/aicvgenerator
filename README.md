# cvgenerator

Human-in-the-loop pipeline that turns one job posting plus your structured resume into a reviewed application package: a tailored resume, a headline, a gap check, and a cover letter. Nothing is ever sent anywhere; you review the Markdown output and send it yourself.

## Setup

```bash
pnpm install
cp .env.example .env            # put your ANTHROPIC_API_KEY in it (or use `ant auth login`)
cp data/resume.example.yaml data/resume.yaml
cp data/anecdotes.example.yaml data/anecdotes.yaml
pnpm exec playwright-core install chromium   # only needed for PDF output
```

Then replace the example content with your own. `data/resume.yaml` and `data/anecdotes.yaml` are git-ignored.

### resume.yaml

JSON Resume's top-level shape, with one difference: every bullet is an object with a stable `id`, `text`, `skills`, and optionally `metric`. The tailor may only reference bullets by id, and the verifier checks each rewritten bullet against its source, so keep any number you care about in `metric`.

The `pending:` list holds gap-check answers you have not yet folded into a section. Merge them by hand when the wording is right.

### anecdotes.yaml

Concrete stories for cover letters: situation, action, result, skills. The letter must use at least one and reports which. Add to this file over time; the gap check offers to save a good answer here too.

## Usage

```bash
pnpm cv run --posting posting.txt        # whole pipeline; creates applications/<company>_<position>_<date>/
pnpm cv run --dir applications/acme_... --from letter   # re-run from a stage after editing inputs
pnpm cv tailor --dir applications/acme_...              # a single stage
cat posting.txt | pnpm cv run -p -                       # posting from stdin
```

Stages, in order: `analyze` → `gaps` (interactive) → `title` (interactive) → `tailor` → `verify` → `letter` → `render`. Each stage writes its JSON artifact to the application folder, so any stage can be re-run once its prerequisites exist.

- `gaps` asks about requirements your resume does not evidence and can save your answers to `pending:` in `resume.yaml` and to `anecdotes.yaml`.
- `title` suggests 3–4 headlines for the line under your name, each backed by real experience in your resume. You pick one, keep your current headline, or type your own. It is stored in `title.json`, used by the tailor for the summary, and printed in `resume.md`.
- `tailor` also polishes wording (grammar, implied subject, consistent tense) and merges overlapping bullets. A merged bullet is verified against all the bullets it combines; if it fails, the original bullets come back separately.

### PDF and Word output

`render` writes Markdown only. Turn it into a styled PDF or an editable Word file with:

```bash
pnpm generate:pdf                                        # most recent application folder
pnpm generate:pdf -d applications/acme_...               # a specific folder
pnpm generate:docx                                       # same, as .docx
pnpm generate:docx -d applications/acme_...
```

Both read `resume.md` and `cover_letter.md` from the folder and write next to them, so re-run them after editing the Markdown by hand. The PDF is A4, rendered with headless Chromium (`playwright-core`). If Chromium fails to start with a missing `lib*.so` error, install its system libraries once, for example `sudo pnpm exec playwright-core install-deps chromium`. The `.docx` has no such dependency. Neither needs an API key or costs anything.

Output folder:

| file | what |
|---|---|
| `job_posting.md` | the posting as pasted |
| `analysis.json` | skills, keywords, seniority, language, red flags |
| `gaps.json` | questions asked and your answers |
| `tailored.json` / `tailored.verified.json` | tailored bullets by source id, after tailoring and after verification |
| `verification.json` | which bullets were reverted and why |
| `title.json` | the headline options offered and the one you chose |
| `cover_letter.json` | paragraphs, anecdotes used, word count, banned phrases found |
| `resume.md`, `cover_letter.md` | what you review and send |
| `resume.pdf`, `cover_letter.pdf` | `pnpm generate:pdf [-d folder]`, styled A4 |
| `resume.docx`, `cover_letter.docx` | `pnpm generate:docx [-d folder]`, editable Word files |
| `notes.md` | keywords targeted, gaps, reverted bullets, API usage and estimated cost |

## Guarantees

- The tailor can only select, reorder, drop, and reword existing bullets. Titles, employers, dates, and education come straight from `resume.yaml`.
- Every rewritten bullet is checked in code (no new numbers) and by a separate model pass (no new tools, scope, or outcomes). Failing bullets revert to their source text and are listed in `notes.md`.
- The cover letter must be 250–350 words, 3–4 paragraphs, use an anecdote from your bank, and is scanned for generic phrases.
- No auto-submission, no scraping, no email. That is a later milestone.

## Development

```bash
pnpm test        # vitest, model calls are faked
pnpm typecheck
```

Models are set per stage in `src/config.ts`: Haiku 4.5 for `analyze`, `gaps` and `title`; Sonnet 5.5 for `tailor`, `verify` and `letter`. `verify` stays on the stronger model because it is the fabrication check. Effort is `low` for verify and `medium` for tailor and the letter (Haiku takes no effort setting). Server-side refusal fallback is enabled on Sonnet. `notes.md` shows the estimated cost per application.
