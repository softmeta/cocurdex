import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  MarkdownFilePathHandlers,
  ResolvedFilePath,
} from "@/components/markdown-file-path";
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

  it("opens file:// links as workspace chips instead of showing [blocked]", async () => {
    const opened: { absolutePath: string }[] = [];
    const handlers: MarkdownFilePathHandlers = {
      resolve: (candidate) => ({ absolutePath: candidate.path }),
      checkExists: async () => true,
      open: (target) => {
        opened.push({ absolutePath: target.absolutePath });
      },
      openLabel: "Open file",
    };
    const content =
      "菜单见 [queued-input-shelf.tsx:196-216](file:///Users/dev/apps/desktop/src/queued-input-shelf.tsx)。";

    render(<MarkdownRenderer content={content} filePathHandlers={handlers} />);

    expect(screen.queryByText(/\[blocked\]/)).toBeNull();
    const chip = await screen.findByRole("link");
    expect(chip).toHaveTextContent("queued-input-shelf.tsx:196-216");
    fireEvent.click(chip);
    expect(opened).toEqual([
      { absolutePath: "/Users/dev/apps/desktop/src/queued-input-shelf.tsx" },
    ]);
  });

  it("carries the range from a backtick-wrapped label", async () => {
    const opened: ResolvedFilePath[] = [];
    const handlers: MarkdownFilePathHandlers = {
      resolve: (candidate) => ({
        absolutePath: candidate.path,
        startLine: candidate.startLine,
        endLine: candidate.endLine,
      }),
      checkExists: async () => true,
      open: (target) => {
        opened.push(target);
      },
      openLabel: "Open file",
    };
    const content =
      "RPC 见 [`service.ts:1544-1572`](file:///Users/dev/packages/daemon/src/service.ts)。";

    render(<MarkdownRenderer content={content} filePathHandlers={handlers} />);

    const chip = await screen.findByRole("link");
    expect(chip).toHaveTextContent("service.ts:1544-1572");
    fireEvent.click(chip);
    expect(opened).toEqual([
      {
        absolutePath: "/Users/dev/packages/daemon/src/service.ts",
        startLine: 1544,
        endLine: 1572,
      },
    ]);
  });

  it("carries the label line range into the opened target", async () => {
    const opened: ResolvedFilePath[] = [];
    const handlers: MarkdownFilePathHandlers = {
      resolve: (candidate) => ({
        absolutePath: candidate.path,
        startLine: candidate.startLine,
        endLine: candidate.endLine,
      }),
      checkExists: async () => true,
      open: (target) => {
        opened.push(target);
      },
      openLabel: "Open file",
    };
    const content =
      "补丁见 [service.ts:1544-1572](file:///Users/dev/packages/daemon/src/service.ts)，" +
      "单行见 [service.ts:1544](file:///Users/dev/packages/daemon/src/service.ts)。";

    render(<MarkdownRenderer content={content} filePathHandlers={handlers} />);

    const chips = await screen.findAllByRole("link");
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      fireEvent.click(chip);
    }

    expect(opened).toEqual([
      {
        absolutePath: "/Users/dev/packages/daemon/src/service.ts",
        startLine: 1544,
        endLine: 1572,
      },
      {
        absolutePath: "/Users/dev/packages/daemon/src/service.ts",
        startLine: 1544,
        endLine: undefined,
      },
    ]);
  });
});
