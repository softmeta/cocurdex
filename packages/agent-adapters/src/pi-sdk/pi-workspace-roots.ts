import { workspacePathsEqual } from "@cocurdex/shared";

export function renderPiWorkspaceRootsPrompt(
  primaryRootPath: string,
  rootPaths: readonly string[] = [],
): string | null {
  const otherRootPaths = rootPaths.filter(
    (rootPath, index) =>
      !workspacePathsEqual(rootPath, primaryRootPath) &&
      rootPaths.findIndex((candidate) =>
        workspacePathsEqual(candidate, rootPath),
      ) === index,
  );
  if (otherRootPaths.length === 0) return null;
  return [
    "This workspace spans multiple local folders. Your working directory is the primary folder; the others are available on disk at these absolute paths:",
    `- ${primaryRootPath} (primary, working directory)`,
    ...otherRootPaths.map((rootPath) => `- ${rootPath}`),
    "Read and search these folders directly instead of looking for the projects elsewhere.",
  ].join("\n");
}
