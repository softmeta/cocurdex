import { buildIssueAgentPrompt } from "@cocurdex/client-runtime";
import { describe, expect, it } from "vitest";

describe("buildIssueAgentPrompt", () => {
  it("keeps the description's Markdown verbatim, including an opening indented code block", () => {
    const description =
      "    pnpm test --filter cart\n\nThe totals are off by one cent.";
    const prompt = buildIssueAgentPrompt({
      identifier: "COC-7",
      title: "Cart totals",
      description: `\n${description}\n\n`,
    });
    expect(prompt).toContain(`\n\n${description}\n\n---`);
  });
});
