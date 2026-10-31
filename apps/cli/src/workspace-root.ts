import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import { withDaemon } from "./daemon-command";

export function isInside(parent: string, child: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export async function findWorkspaceRootPath(target: string) {
  const workspaces = await withDaemon(() => requestDaemon("workspace.list"));
  const rootPaths = workspaces
    .flatMap((workspace) => workspace.rootPaths)
    .filter((rootPath) => isInside(rootPath, target))
    .sort((left, right) => right.length - left.length);
  const [rootPath] = rootPaths;
  if (!rootPath) {
    throw new Error(`No registered workspace contains ${target}`);
  }
  return rootPath;
}
