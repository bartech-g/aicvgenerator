import { describe, expect, it } from "vitest";
import { bannedPhrasesIn, hardViolations, wordCount } from "../src/stages/letter.js";

const para = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("cover letter validation", () => {
  it("counts words across paragraphs", () => {
    expect(wordCount(["a b", " c  d "])).toBe(4);
  });
  it("flags length, paragraph count, and missing anecdotes", () => {
    const v = hardViolations({ language: "en", paragraphs: [para(50), para(50)], anecdoteIdsUsed: ["ghost"] }, new Set(["real"]));
    expect(v).toHaveLength(3);
  });
  it("passes a compliant draft", () => {
    const v = hardViolations({ language: "en", paragraphs: [para(100), para(100), para(80)], anecdoteIdsUsed: ["real"] }, new Set(["real"]));
    expect(v).toEqual([]);
  });
  it("detects banned phrases case-insensitively", () => {
    expect(bannedPhrasesIn("I am EXCITED to apply because I am a Team Player")).toEqual(["i am excited to apply", "team player"]);
  });
});
