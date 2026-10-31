import remend from "remend";
import { splitMarkdownBlocks } from "./markdown-blocks";
import type { MarkdownSegment } from "./markdown-segments";

export type StreamingBlock =
  | { kind: "markdown"; key: string; text: string }
  | { kind: "mermaid"; key: string; source: string }
  | { kind: "image"; key: string; fileName: string; alt: string };

function completeTail(text: string) {
  return remend(text, { linkMode: "text-only", images: false });
}

function markdownBlocks(text: string, split: boolean) {
  return split ? splitMarkdownBlocks(text) : [{ line: 0, text }];
}

export function streamingBlocks(
  segments: readonly MarkdownSegment[],
  { live, split }: { live: boolean; split: boolean },
): StreamingBlock[] {
  const blocks = segments.flatMap((segment): StreamingBlock[] => {
    if (segment.kind === "mermaid") {
      return [
        {
          kind: "mermaid",
          key: `mermaid-${segment.line}`,
          source: segment.source,
        },
      ];
    }
    if (segment.kind === "image") {
      return [
        {
          kind: "image",
          key: `image-${segment.line}:${segment.column}`,
          fileName: segment.fileName,
          alt: segment.alt,
        },
      ];
    }
    const column = segment.column ? `:${segment.column}` : "";
    return markdownBlocks(segment.text, split).map((block) => ({
      kind: "markdown",
      key: `markdown-${segment.line + block.line}${block.line === 0 ? column : ""}`,
      text: block.text,
    }));
  });
  const last = blocks.at(-1);
  if (!live || last?.kind !== "markdown") return blocks;
  return [...blocks.slice(0, -1), { ...last, text: completeTail(last.text) }];
}
