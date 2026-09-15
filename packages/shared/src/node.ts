import path from "node:path";

// Node-only helpers. This entry is not exported from the package root so the
// isomorphic `@cocurdex/shared` barrel stays browser-safe; import it as
// `@cocurdex/shared/node` from daemon or Electron main code only.

// Windows and default macOS filesystems are case-insensitive, so a casing
// mismatch between the stored workspace root and the incoming path must not
// reject a legitimate file. Linux stays case-sensitive.
const isCaseInsensitiveFs =
  process.platform === "win32" || process.platform === "darwin";

function foldCase(value: string): string {
  return isCaseInsensitiveFs ? value.toLowerCase() : value;
}

// `filePath` arrives from a client and is therefore untrusted. The workspace
// roots, by contrast, MUST come from daemon/main-process state (the registered
// workspace list) — never from the same request — so the check cannot be
// satisfied by a caller who controls the request. Returns the resolved
// absolute path on success; throws otherwise. Kept pure (no fs access) so the
// authorization boundary can be unit-tested without platform services.
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
