import { describe, expect, it } from "vitest";
import { renderResumeMarkdown } from "../src/render/markdown.js";
import type { Tailored } from "../src/schema/artifacts.js";
import { exampleResume } from "./helpers.js";

describe("renderResumeMarkdown", () => {
  it("takes titles, employers and dates from the base resume and bullets from the tailored set", () => {
    const resume = exampleResume();
    const tailored: Tailored = {
      summary: "Tailored summary.",
      sections: [
        { sourceSectionId: "work-shoply", bullets: [{ sourceId: "shoply-2", newText: "Contract tests first." }] },
        { sourceSectionId: "work-finpay", bullets: [{ sourceId: "finpay-2", newText: "Latency work." }] },
      ],
      skillsOrder: ["PostgreSQL", "Go"],
    };
    const md = renderResumeMarkdown(resume, tailored);
    expect(md).toMatchSnapshot();
    expect(md).toContain("### Senior Backend Engineer, FinPay");
    expect(md).toContain("2022-03 – present");
    expect(md).not.toContain("finpay-1");
    expect(md).not.toContain("ledgerkit");
    expect(md.indexOf("FinPay")).toBeLessThan(md.indexOf("Shoply"));
  });
  it("emits ids as comments when asked", () => {
    const md = renderResumeMarkdown(exampleResume(), { summary: "", sections: [{ sourceSectionId: "work-finpay", bullets: [{ sourceId: "finpay-1", newText: "x" }] }], skillsOrder: [] }, { withIds: true });
    expect(md).toContain("<!-- finpay-1 -->");
  });
});
