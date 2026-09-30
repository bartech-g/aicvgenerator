import { describe, expect, it } from "vitest";
import { assertUniqueIds, bulletSources, Resume } from "../src/schema/resume.js";
import { exampleAnecdotes, exampleResume } from "./helpers.js";

describe("example data", () => {
  it("resume.example.yaml validates and has unique ids", () => {
    const r = exampleResume();
    expect(() => assertUniqueIds(r)).not.toThrow();
    expect(bulletSources(r).size).toBe(6);
  });
  it("anecdotes.example.yaml validates", () => {
    expect(exampleAnecdotes().anecdotes.length).toBeGreaterThan(0);
  });
  it("rejects duplicate bullet ids", () => {
    const r = exampleResume();
    r.work[1]!.bullets[0]!.id = "finpay-1";
    expect(() => assertUniqueIds(r)).toThrow(/Duplicate id/);
  });
  it("rejects ids that are not kebab-case", () => {
    expect(() => Resume.parse({ basics: { name: "x" }, work: [{ id: "Bad Id", company: "c", position: "p", startDate: "2020" }] })).toThrow();
  });
});
