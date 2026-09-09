export function toolMayMutateWorkspace(tool: {
  kind?: string | null;
  title?: string | null;
}): boolean {
  const candidates = [tool.kind, tool.title].flatMap((value) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      return [];
    }
    const trimmed = value.trim();
    const firstToken = trimmed.split(/[\s:/]+/)[0] ?? trimmed;
    return [trimmed, firstToken];
  });

  return !candidates.some((candidate) =>
    READ_ONLY_WORKSPACE_TOOLS.has(normalizeToolName(candidate)),
  );
}

function normalizeToolName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const READ_ONLY_WORKSPACE_TOOLS = new Set([
  "fetch",
  "find",
  "glob",
  "grep",
  "list",
  "listdir",
  "listfiles",
  "listmcpresources",
  "ls",
  "read",
  "readfile",
  "readmcpresource",
  "search",
  "think",
  "todoread",
  "todowrite",
  "webfetch",
  "websearch",
]);
