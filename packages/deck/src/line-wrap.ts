import { splitCjk } from "./script-segments";

export interface WrapPiece {
  text: string;
}

export type Placed<T extends WrapPiece> = T & { width: number };

const WORD_OR_SPACE = /\S+\s*|\s+/gu;

function pieceTokens(text: string): string[] {
  if (splitCjk(text).every((segment) => segment.cjk)) return [...text];
  return text.match(WORD_OR_SPACE) ?? [text];
}

function sameSource<T extends WrapPiece>(a: T, b: T): boolean {
  return Object.keys(a).every(
    (key) =>
      key === "text" ||
      key === "width" ||
      a[key as keyof T] === b[key as keyof T],
  );
}

export function wrapPieces<T extends WrapPiece>(
  pieces: T[],
  measure: (piece: T) => number,
  width: number,
): Placed<T>[][] {
  const lines: Placed<T>[][] = [[]];
  let used = 0;
  for (const piece of pieces) {
    for (const text of pieceTokens(piece.text)) {
      const token = { ...piece, text };
      const tokenWidth = measure(token);
      const filled = lines[lines.length - 1].length > 0;
      if (filled && used + tokenWidth > width && text.trim()) {
        lines.push([]);
        used = 0;
      }
      const line = lines[lines.length - 1];
      const last = line.at(-1);
      if (last && sameSource(last, token)) {
        line[line.length - 1] = {
          ...last,
          text: last.text + text,
          width: last.width + tokenWidth,
        };
      } else {
        line.push({ ...token, width: tokenWidth });
      }
      used += tokenWidth;
    }
  }
  return lines;
}

export function lineWidth<T extends WrapPiece>(
  line: Placed<T>[],
  measure: (piece: T) => number,
): number {
  const last = line.at(-1);
  if (!last) return 0;
  const head = line.slice(0, -1).reduce((sum, piece) => sum + piece.width, 0);
  return head + measure({ ...last, text: last.text.trimEnd() });
}
