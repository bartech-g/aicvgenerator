import { describe, expect, it } from "vitest";
import { numbersIn, numericIssues, verifyTailored } from "../src/stages/verify.js";
import { sanitizeTailored } from "../src/stages/tailor.js";
import type { Tailored } from "../src/schema/artifacts.js";
import { exampleResume, fakeLlm, tempCtx } from "./helpers.js";

describe("numeric checks", () => {
  it("normalises thousand separators", () => {
    expect(numbersIn("1,200 orders and 1.2M")).toEqual(new Set(["1200", "1.2"]));
  });
  it("flags a number not present in the source", () => {
    expect(numericIssues("Handled 2M transactions", "Handled many transactions", "1.2M")).toEqual(['introduces number "2" not in source']);
  });
  it("accepts numbers that come from the metric field", () => {
    expect(numericIssues("Cut latency to 120ms", "Cut latency a lot", "800ms to 120ms")).toEqual([]);
  });
});

describe("sanitizeTailored", () => {
  const resume = exampleResume();
  it("drops unknown ids and unknown sections, keeps one bullet per work entry", () => {
    const raw: Tailored = {
      summary: "s",
      sections: [
        { sourceSectionId: "work-finpay", bullets: [{ sourceId: "finpay-1", newText: "a" }, { sourceId: "made-up", newText: "b" }] },
        { sourceSectionId: "nope", bullets: [{ sourceId: "shoply-1", newText: "c" }] },
      ],
      skillsOrder: ["go", "Rust", "TypeScript"],
    };
    const { tailored, dropped } = sanitizeTailored(raw, resume);
    expect(dropped).toEqual(["section nope", "bullet made-up", "skill Rust"]);
    const shoply = tailored.sections.find((s) => s.sourceSectionId === "work-shoply")!;
    expect(shoply.bullets).toEqual([{ sourceId: "shoply-1", newText: resume.work[1]!.bullets[0]!.text }]);
    expect(tailored.skillsOrder.slice(0, 2)).toEqual(["Go", "TypeScript"]);
    expect(tailored.skillsOrder).toContain("Kubernetes");
  });
  it("rejects a bullet placed under the wrong section", () => {
    const raw: Tailored = {
      summary: "s",
      sections: [{ sourceSectionId: "work-finpay", bullets: [{ sourceId: "shoply-1", newText: "x" }] }],
      skillsOrder: [],
    };
    const { dropped } = sanitizeTailored(raw, resume);
    expect(dropped).toContain("bullet shoply-1");
  });
});

describe("verifyTailored", () => {
  it("reverts bullets flagged by code or model and reverts a bad summary", async () => {
    const { llm } = fakeLlm({
      verify: {
        bullets: [
          { sourceId: "finpay-1", ok: true, issues: [] },
          { sourceId: "finpay-2", ok: false, issues: ['claims "Kafka" which is not in source'] },
        ],
        summary: { ok: false, issues: ["claims leadership of 10 people"] },
      },
    });
    const ctx = { ...tempCtx({ llm }), dir: "/tmp/unused" };
    const tailored: Tailored = {
      summary: "Led 10 engineers",
      sections: [
        {
          sourceSectionId: "work-finpay",
          bullets: [
            { sourceId: "finpay-1", newText: "Shipped a ledger handling 5M transactions per day" },
            { sourceId: "finpay-2", newText: "Cut p99 latency using Kafka" },
          ],
        },
      ],
      skillsOrder: [],
    };
    const { verification, verified } = await verifyTailored(ctx, tailored);
    expect(verification.rejectedIds).toEqual(["finpay-1", "finpay-2"]);
    expect(verification.bullets[0]!.issues[0]).toMatch(/number "5"/);
    expect(verification.summaryRejected).toBe(true);
    expect(verified.summary).toBe(ctx.resume.basics.summary);
    expect(verified.sections[0]!.bullets.map((b) => b.newText)).toEqual(ctx.resume.work[0]!.bullets.slice(0, 2).map((b) => b.text));
  });

  it("keeps valid merged ids, drops invalid or duplicate ones", () => {
    const resume = exampleResume();
    const { tailored, dropped } = sanitizeTailored(
      {
        summary: "",
        sections: [{ sourceSectionId: "work-finpay", bullets: [{ sourceId: "finpay-1", newText: "m", mergedIds: ["finpay-2", "shoply-1", "nope"] }] }],
        skillsOrder: [],
      },
      resume,
    );
    expect(tailored.sections.find((s) => s.sourceSectionId === "work-finpay")!.bullets).toEqual([
      { sourceId: "finpay-1", newText: "m", mergedIds: ["finpay-2"] },
    ]);
    expect(dropped).toEqual(["merged bullet shoply-1", "merged bullet nope"]);
  });
});
