export type MarkdownSegment =
  | { kind: "markdown"; line: number; column?: number; text: string }
  | { kind: "mermaid"; line: number; source: string }
  | {
      kind: "image";
      line: number;
      column: number;
      fileName: string;
      alt: string;
    };

const OPENING_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*mermaid[ \t]*$/i;

function closesFence(line: string, fence: string) {
  const trimmed = line.trim();
  return (
    trimmed.length >= fence.length &&
    trimmed[0] === fence[0] &&
    [...trimmed].every((character) => character === fence[0])
  );
}

export function splitMermaidBlocks(markdown: string): MarkdownSegment[] {
  const lines = markdown.split(/\r?\n/);
  const segments: MarkdownSegment[] = [];
  let prose: string[] = [];
  let proseLine = 0;
  const flushProse = (nextLine: number) => {
    const text = prose.join("\n");
    if (text.trim() !== "") {
      segments.push({ kind: "markdown", line: proseLine, text });
    }
    prose = [];
    proseLine = nextLine;
  };
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const fence = OPENING_FENCE.exec(line)?.[1];
    const closing = fence
      ? lines.findIndex(
          (candidate, at) => at > index && closesFence(candidate, fence),
        )
      : -1;
    if (!fence || closing < 0) {
      prose.push(line);
      index += 1;
      continue;
    }
    flushProse(closing + 1);
    segments.push({
      kind: "mermaid",
      line: index,
      source: lines.slice(index + 1, closing).join("\n"),
    });
    index = closing + 1;
  }
  flushProse(lines.length);
  return segments;
}
