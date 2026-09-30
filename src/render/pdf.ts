import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { marked } from "marked";
import { chromium } from "playwright-core";
import type { Resume } from "../schema/resume.js";

const CSS = `
@page { size: A4; margin: 14mm 16mm; }
* { box-sizing: border-box; }
body { font: 10pt/1.42 "Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif; color: #1c1c1c; margin: 0; }
h1 { font-size: 22pt; margin: 0 0 2px; letter-spacing: .3px; }
h1 + p > strong { color: #2b5c8a; font-size: 11.5pt; }
h1 + p, h1 + p + p { margin: 0 0 3px; }
h1 + p + p { color: #555; font-size: 9pt; }
h2 { font-size: 10.5pt; text-transform: uppercase; letter-spacing: 1.2px; color: #2b5c8a; border-bottom: 1px solid #c9d6e2; padding-bottom: 2px; margin: 14px 0 6px; break-after: avoid; }
h3 { font-size: 10.5pt; margin: 9px 0 0; break-after: avoid; }
h3 + p { margin: 0 0 3px; color: #666; font-size: 9pt; }
p { margin: 0 0 6px; }
ul { margin: 2px 0 4px; padding-left: 16px; }
li { margin: 0 0 2px; break-inside: avoid; }
a { color: inherit; text-decoration: none; }
.letter { font-size: 10.5pt; line-height: 1.55; }
.letter header { border-bottom: 1px solid #c9d6e2; margin-bottom: 18px; padding-bottom: 8px; }
.letter header .name { font-size: 18pt; font-weight: 600; }
.letter header .contact { color: #555; font-size: 9pt; }
.letter p { margin: 0 0 11px; text-align: left; }
`;

function page(body: string, cls = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body class="${cls}">${body}</body></html>`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function resumeHtml(markdown: string): string {
  return page(marked.parse(markdown, { async: false }) as string);
}

export function letterHtml(markdown: string, resume: Resume): string {
  const b = resume.basics;
  const contact = [b.email, b.phone, b.location].filter((x): x is string => Boolean(x)).map(esc).join(" · ");
  const header = `<header><div class="name">${esc(b.name)}</div><div class="contact">${contact}</div></header>`;
  return page(header + marked.parse(markdown, { async: false }), "letter");
}

function chromePath(): string | undefined {
  const root = path.join(os.homedir(), ".cache", "ms-playwright");
  if (!fs.existsSync(root)) return undefined;
  for (const d of fs.readdirSync(root).filter((n) => n.startsWith("chromium-")).sort().reverse()) {
    const p = path.join(root, d, "chrome-linux64", "chrome");
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

export async function htmlToPdf(jobs: { html: string; out: string }[]): Promise<void> {
  const browser = await chromium.launch({ executablePath: chromePath() });
  try {
    for (const { html, out } of jobs) {
      const pg = await browser.newPage();
      await pg.setContent(html, { waitUntil: "load" });
      await pg.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true });
      await pg.close();
    }
  } finally {
    await browser.close();
  }
}
