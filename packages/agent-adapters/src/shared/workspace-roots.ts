import { workspacePathsEqual } from "@cocurdex/shared";

export function additionalWorkspaceRoots(
  primaryRootPath: string,
  rootPaths: readonly string[] = [],
): string[] {
  return rootPaths.filter(
    (rootPath, index) =>
      !workspacePathsEqual(rootPath, primaryRootPath) &&
      rootPaths.findIndex((candidate) =>
        workspacePathsEqual(candidate, rootPath),
      ) === index,
  );
}
