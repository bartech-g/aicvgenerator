import { describe, expect, it } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";
import { letterDocx, resumeDocx } from "../src/render/docx.js";
import { exampleResume } from "./helpers.js";

async function xml(doc: Parameters<typeof Packer.toBuffer>[0]): Promise<string> {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  return zip.file("word/document.xml")!.async("string");
}

describe("docx render", () => {
  it("splits headline and contact, keeps links and bullets", async () => {
    const md = "# Ada\n**Engineer**\na@b.c · [GitHub](https://github.com/a)\n\n## Experience\n\n### Dev, Acme\n2020 – 2021\n\n- Built things\n";
    const x = await xml(resumeDocx(md));
    expect(x).toContain("Engineer");
    expect(x).toContain("<w:hyperlink");
    expect(x).toContain("<w:numPr>");
    expect(x.match(/<w:p[ >]/g)!.length).toBe(7);
  });

  it("writes the letter with a header from the resume", async () => {
    const x = await xml(letterDocx("One.\n\nTwo.\n", exampleResume()));
    expect(x).toContain(exampleResume().basics.name);
    expect(x).toContain("Two.");
  });
});
