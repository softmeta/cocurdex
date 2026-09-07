export interface WorkspaceWorktreeEnvironment {
  workspaceId: string;
  setupScript: string;
  cleanupScript: string;
  updatedAt: string | null;
}

export function emptyWorktreeEnvironment(
  workspaceId: string,
): WorkspaceWorktreeEnvironment {
  return {
    workspaceId,
    setupScript: "",
    cleanupScript: "",
    updatedAt: null,
  };
}

export function suggestWorktreeSetupScript(
  fileNames: readonly string[],
): string {
  const names = new Set(fileNames);

  if (names.has("pnpm-lock.yaml")) {
    return "pnpm install";
  }
  if (names.has("yarn.lock")) {
    return "yarn install";
  }
  if (names.has("bun.lock") || names.has("bun.lockb")) {
    return "bun install";
  }
  if (names.has("package-lock.json") || names.has("package.json")) {
    return "npm install";
  }
  if (names.has("Cargo.toml")) {
    return "cargo fetch";
  }
  if (names.has("go.mod")) {
    return "go mod download";
  }
  if (names.has("poetry.lock")) {
    return "poetry install";
  }
  if (names.has("uv.lock")) {
    return "uv sync";
  }
  if (names.has("requirements.txt")) {
    return "pip install -r requirements.txt";
  }
  return "";
}
