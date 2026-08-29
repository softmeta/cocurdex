import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownRenderer } from "@/components/markdown-renderer";

describe("MarkdownRenderer", () => {
  it("highlights file-annotated TSX code fences", async () => {
    const content = [
      "```6:49:apps/v4/registry/bases/base/ui/button.tsx",
      'const buttonVariants = cva("cn-button", { variants: {} });',
      "```",
    ].join("\n");

    const { container } = render(<MarkdownRenderer content={content} />);

    expect(screen.getByText("tsx")).toBeInTheDocument();
    await waitFor(() => {
      const highlightedTokens = Array.from(
        container.querySelectorAll<HTMLElement>(
          '[data-streamdown="code-block-body"] code span span',
        ),
      ).filter((token) => {
        const color = token.style.getPropertyValue("--sdm-c");
        return color.length > 0 && color !== "inherit";
      });

      expect(highlightedTokens.length).toBeGreaterThan(0);
    });
  });
});
