import { resolvePdfReadPath } from "@cocurdex/shared/node";

// The workspace-root authorization check is shared with the daemon, which
// applies the same policy when persisting PDF annotations.
export { resolvePdfReadPath };

// The URL deliberately carries only the file path. The workspace scope is
// re-derived from main-process state when the protocol handler serves the
// request, so a crafted URL cannot smuggle in its own authorization root.
export function buildPdfAssetUrl(filePath: string): string {
  return `pdf-asset://workspace?file=${encodeURIComponent(filePath)}`;
}

export function parsePdfAssetUrl(urlString: string): string {
  const url = new URL(urlString);
  const filePath = url.searchParams.get("file");

  if (!filePath) {
    throw new Error("Invalid pdf-asset URL: missing file parameter");
  }

  return filePath;
}
