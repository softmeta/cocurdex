import { realpath } from "node:fs/promises";
import path from "node:path";
import { isPathWithinRoots as isLexicallyWithinRoots } from "./workspace-roots";

// Node-only helpers. This entry is not exported from the package root so the
// isomorphic `@cocurdex/shared` barrel stays browser-safe; import it as
// `@cocurdex/shared/node` from daemon or Electron main code only.

// Lexical containment of an already-absolute candidate inside one of the
// given roots. Pure (no fs access); callers that need symlink safety should
// realpath both sides first, as resolveAuthorizedPdfReadPath does.
export function isPathWithinRoots(
  candidatePath: string,
  rootPaths: readonly string[],
): boolean {
  return isLexicallyWithinRoots(
    path.resolve(candidatePath),
    rootPaths.map((rootPath) => path.resolve(rootPath)),
  );
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

  const isInsideWorkspace = isPathWithinRoots(resolvedPath, workspaceRootPaths);

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

// resolvePdfReadPath only sees the path string, so a symlink inside a
// workspace could point outside it. When the target exists, canonicalize the
// file and the roots and re-check containment so the authorization decision
// follows the real filesystem. Missing files keep the lexical result — the
// check is about authorization scope, not existence.
export async function resolveAuthorizedPdfReadPath(
  filePath: string,
  workspaceRootPaths: readonly string[],
): Promise<string> {
  const resolvedPath = resolvePdfReadPath(filePath, workspaceRootPaths);
  const realPath = await realpath(resolvedPath).catch(() => null);
  if (!realPath) {
    return resolvedPath;
  }
  const realRoots = await Promise.all(
    workspaceRootPaths.map((rootPath) =>
      realpath(rootPath).catch(() => path.resolve(rootPath)),
    ),
  );
  if (!isPathWithinRoots(realPath, realRoots)) {
    throw new Error(
      `PDF is outside every registered workspace (path=${resolvedPath})`,
    );
  }
  // The canonical path only proves authorization; callers keep the lexical
  // path so identities like annotation storage keys stay stable across
  // symlinked workspace roots.
  return resolvedPath;
}
