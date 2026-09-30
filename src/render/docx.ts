import fs from "node:fs";
import { AlignmentType, BorderStyle, Document, ExternalHyperlink, LevelFormat, Packer, Paragraph, TextRun } from "docx";
import { marked, type Token, type Tokens } from "marked";
import type { Resume } from "../schema/resume.js";

const FONT = "Calibri";
const BLUE = "2B5C8A";
const GREY = "666666";
const PT = (n: number) => n * 2; // docx sizes are half-points

type Style = { bold?: boolean; italics?: boolean; size?: number; color?: string; allCaps?: boolean };

function inline(tokens: Token[] | undefined, style: Style = {}): (TextRun | ExternalHyperlink)[] {
  const out: (TextRun | ExternalHyperlink)[] = [];
  const run = (text: string, s: Style) =>
    new TextRun({ text, font: FONT, bold: s.bold, italics: s.italics, size: s.size, color: s.color, allCaps: s.allCaps });
  for (const t of tokens ?? []) {
    switch (t.type) {
      case "strong":
        out.push(...inline((t as Tokens.Strong).tokens, { ...style, bold: true }));
        break;
      case "em":
        out.push(...inline((t as Tokens.Em).tokens, { ...style, italics: true }));
        break;
      case "link": {
        const l = t as Tokens.Link;
        out.push(new ExternalHyperlink({ link: l.href, children: inline(l.tokens, { ...style, color: style.color ?? BLUE }) as TextRun[] }));
        break;
      }
      case "br":
        out.push(new TextRun({ break: 1 }));
        break;
      default: {
        const text = (t as { text?: string }).text ?? t.raw;
        text.split("\n").forEach((line, i) => {
          if (i > 0) out.push(new TextRun({ break: 1 }));
          if (line) out.push(run(line, style));
        });
      }
    }
  }
  return out;
}

function heading(t: Tokens.Heading, isFirst: boolean): Paragraph {
  if (t.depth === 1)
    return new Paragraph({ spacing: { after: 40 }, children: inline(t.tokens, { bold: true, size: PT(22) }) });
  if (t.depth === 2)
    return new Paragraph({
      spacing: { before: 240, after: 80 },
      keepNext: true,
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C9D6E2", space: 2 } },
      children: inline(t.tokens, { bold: true, size: PT(10.5), color: BLUE, allCaps: true }),
    });
  return new Paragraph({ spacing: { before: isFirst ? 0 : 160, after: 0 }, keepNext: true, children: inline(t.tokens, { bold: true, size: PT(10.5) }) });
}

function body(tokens: Token[]): Paragraph[] {
  const out: Paragraph[] = [];
  let seenH1 = false;
  let afterH1 = 0; // paragraphs since the h1: 1 = headline label, 2 = contact line
  let afterH3 = false;
  for (const t of tokens) {
    if (t.type === "space") continue;
    if (t.type === "heading") {
      const h = t as Tokens.Heading;
      if (h.depth === 1) seenH1 = true;
      afterH3 = h.depth === 3;
      out.push(heading(h, out.length === 0));
    } else if (t.type === "paragraph") {
      const p = t as Tokens.Paragraph;
      if (seenH1 && afterH1 < 2) {
        // "**Headline**\ncontact line" is one Markdown paragraph; the document wants two.
        const [first, ...rest] = p.tokens;
        const hasLabel = first?.type === "strong";
        if (hasLabel) out.push(new Paragraph({ spacing: { after: 40 }, children: inline([first!], { size: PT(11.5), color: BLUE }) }));
        const contact = (hasLabel ? rest : p.tokens).map((x, i) => (i === 0 && x.type === "text" ? { ...x, text: (x as Tokens.Text).text.replace(/^\n/, ""), raw: x.raw.replace(/^\n/, "") } : x));
        if (contact.length) out.push(new Paragraph({ spacing: { after: 40 }, children: inline(contact, { size: PT(9), color: GREY }) }));
        afterH1 = 2;
      } else {
        out.push(new Paragraph({ spacing: { after: afterH3 ? 40 : 100 }, children: inline(p.tokens, afterH3 ? { size: PT(9), color: GREY } : { size: PT(10) }) }));
      }
      afterH3 = false;
    } else if (t.type === "list") {
      for (const item of (t as Tokens.List).items) {
        out.push(
          new Paragraph({
            numbering: { reference: "bullets", level: 0 },
            spacing: { after: 30 },
            children: inline(item.tokens.flatMap((x) => ("tokens" in x && x.tokens ? x.tokens : [x])), { size: PT(10) }),
          }),
        );
      }
      afterH3 = false;
    }
  }
  return out;
}

function makeDocument(children: Paragraph[]): Document {
  return new Document({
    creator: "cvgenerator",
    styles: { default: { document: { run: { font: FONT, size: PT(10) } } } },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 340, hanging: 220 } } } }],
        },
      ],
    },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 794, bottom: 794, left: 907, right: 907 } } }, children }],
  });
}

export function resumeDocx(markdown: string): Document {
  return makeDocument(body(marked.lexer(markdown)));
}

export function letterDocx(markdown: string, resume: Resume): Document {
  const b = resume.basics;
  const contact = [b.email, b.phone, b.location].filter((x): x is string => Boolean(x)).join(" · ");
  const head = [
    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: b.name, font: FONT, bold: true, size: PT(18) })] }),
    new Paragraph({
      spacing: { after: 300 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C9D6E2", space: 6 } },
      children: [new TextRun({ text: contact, font: FONT, size: PT(9), color: GREY })],
    }),
  ];
  const paras = marked
    .lexer(markdown)
    .filter((t) => t.type === "paragraph")
    .map((t) => new Paragraph({ spacing: { after: 200, line: 300 }, children: inline((t as Tokens.Paragraph).tokens, { size: PT(10.5) }) }));
  return makeDocument([...head, ...paras]);
}

export async function writeDocx(doc: Document, out: string): Promise<void> {
  fs.writeFileSync(out, await Packer.toBuffer(doc));
}
