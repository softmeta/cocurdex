import { scanFilePathCandidates } from "@cocurdex/shared";
import { Children, type ReactNode } from "react";
import type { MarkdownFilePathHandlers } from "./markdown-file-path";
import { MarkdownFilePathCode } from "./markdown-renderer-file-path";
import type { MarkdownRendererTone } from "./markdown-renderer-styles";

export function linkifyFilePaths(
  children: ReactNode,
  handlers: MarkdownFilePathHandlers,
  tone: MarkdownRendererTone,
): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child !== "string") {
      return child;
    }

    const matches = scanFilePathCandidates(child);
    if (matches.length === 0) {
      return child;
    }

    const parts: ReactNode[] = [];
    let cursor = 0;
    for (const match of matches) {
      if (match.index > cursor) {
        parts.push(child.slice(cursor, match.index));
      }
      const end = match.index + match.length;
      parts.push(
        <MarkdownFilePathCode
          candidate={match.candidate}
          handlers={handlers}
          key={`fp-${match.index}`}
          tone={tone}
          variant="text"
        >
          {child.slice(match.index, end)}
        </MarkdownFilePathCode>,
      );
      cursor = end;
    }
    if (cursor < child.length) {
      parts.push(child.slice(cursor));
    }
    return parts;
  });
}
