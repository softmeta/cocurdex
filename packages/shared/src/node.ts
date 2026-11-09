import { realpath } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { type EnvMap, resolveNodeGlobalProxyEnv } from "./network-proxy";
import { isPathWithinRoots as isLexicallyWithinRoots } from "./workspace-roots";

export * from "./logs";
export * from "./shell-env";

export function isPathWithinRoots(
  candidatePath: string,
  rootPaths: readonly string[],
): boolean {
  return isLexicallyWithinRoots(
    path.resolve(candidatePath),
    rootPaths.map((rootPath) => path.resolve(rootPath)),
  );
}

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
  return resolvedPath;
}

let restoreNodeGlobalProxy: (() => void) | null = null;

export function applyNodeGlobalProxy(env: EnvMap): void {
  restoreNodeGlobalProxy?.();
  restoreNodeGlobalProxy = null;
  const proxyEnv = resolveNodeGlobalProxyEnv(env);
  if (!proxyEnv.http_proxy && !proxyEnv.https_proxy) {
    return;
  }
  restoreNodeGlobalProxy = http.setGlobalProxyFromEnv({ ...proxyEnv });
}
