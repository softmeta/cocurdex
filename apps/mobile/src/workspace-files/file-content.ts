export const MAX_PREVIEW_BYTES = 512 * 1024;

export type FileContent =
  | { kind: "text"; text: string; lines: string[]; truncated: boolean }
  | { kind: "binary" };

export type FileLoadFailure = "outside" | "missing" | "failed";

export class FileLoadError extends Error {
  constructor(readonly reason: FileLoadFailure) {
    super(`File preview failed: ${reason}`);
  }
}

export function fileLoadFailure(status: number): FileLoadFailure {
  if (status === 403) return "outside";
  if (status === 404) return "missing";
  return "failed";
}

function contentRangeTotal(header: string | null) {
  const total = header ? /\/(\d+)$/.exec(header)?.[1] : undefined;
  return total === undefined ? null : Number(total);
}

export function readFileContent(
  status: number,
  contentRange: string | null,
  body: string,
): FileContent {
  if (status === 416)
    return { kind: "text", text: "", lines: [""], truncated: false };
  if (status !== 200 && status !== 206) {
    throw new FileLoadError(fileLoadFailure(status));
  }
  if (body.includes("\u0000")) return { kind: "binary" };
  const total = contentRangeTotal(contentRange);
  const truncated =
    status === 206 && total !== null && total > MAX_PREVIEW_BYTES;
  const text = truncated ? body.replace(/�+$/, "") : body;
  const lines = text.split(/\r?\n/);
  if (truncated && lines.length > 1) lines.pop();
  return { kind: "text", text: lines.join("\n"), lines, truncated };
}
