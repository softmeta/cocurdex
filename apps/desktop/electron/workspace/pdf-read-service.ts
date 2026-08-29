import path from "node:path";

// Windows and default macOS filesystems are case-insensitive, so a casing
// mismatch between the stored workspace root and the incoming path must not
// reject a legitimate file. Linux stays case-sensitive.
const isCaseInsensitiveFs =
  process.platform === "win32" || process.platform === "darwin";

function foldCase(value: string): string {
  return isCaseInsensitiveFs ? value.toLowerCase() : value;
}

// `filePath` arrives from the renderer (or a pdf-asset URL) and is therefore
// untrusted. The workspace roots, by contrast, MUST come from main-process
// state (the registered workspace list) — never from the same request — so the
// check cannot be satisfied by an attacker who controls the request. Returns
// the resolved absolute path on success; throws otherwise. Kept pure (no fs
// access) so the authorization boundary can be unit-tested without Electron.
export function resolvePdfReadPath(
  filePath: string,
  workspaceRootPaths: readonly string[],
): string {
  const resolvedPath = path.resolve(filePath);
  const foldedPath = foldCase(resolvedPath);

  const isInsideWorkspace = workspaceRootPaths.some((rootPath) => {
    const foldedRoot = foldCase(path.resolve(rootPath));
    return (
      foldedPath === foldedRoot ||
      foldedPath.startsWith(`${foldedRoot}${path.sep}`)
    );
  });

  if (!isInsideWorkspace) {
    throw new Error(
      `PDF is outside every registered workspace (path=${resolvedPath})`,
    );
  }

  if (path.extname(resolvedPath).toLowerCase() !== ".pdf") {
    throw new Error(`File is not a PDF (path=${resolvedPath})`);
  }

  return resolvedPath;
}

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
