import type { RemoteFileFailure } from "@cocurdex/shared";

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

export function fileLoadFailure(
  reason: RemoteFileFailure | "unreachable",
): FileLoadFailure {
  if (reason === "forbidden") return "outside";
  if (reason === "notFound") return "missing";
  return "failed";
}

const decoder = new TextDecoder();

export function readFileContent(bytes: Uint8Array, size: number): FileContent {
  if (bytes.includes(0)) return { kind: "binary" };
  const truncated = size > bytes.length;
  const body = decoder.decode(bytes);
  const text = truncated ? body.replace(/�+$/, "") : body;
  const lines = text.split(/\r?\n/);
  if (truncated && lines.length > 1) lines.pop();
  return { kind: "text", text: lines.join("\n"), lines, truncated };
}
