export function getWorkspaceDependencyNames(
  dependencies: Record<string, string> | undefined,
): string[] {
  if (!dependencies) {
    return [];
  }

  return Object.entries(dependencies)
    .filter(([, version]) => version.startsWith("workspace:"))
    .map(([name]) => name)
    .sort();
}
