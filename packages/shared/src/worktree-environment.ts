export interface WorktreeEnvironmentProposal {
  setupScript: string;
  cleanupScript: string;
  rationale: string | null;
  proposedAt: string;
}

export interface WorkspaceWorktreeEnvironment {
  workspaceId: string;
  setupScript: string;
  cleanupScript: string;
  updatedAt: string | null;
  proposal: WorktreeEnvironmentProposal | null;
}

export function emptyWorktreeEnvironment(
  workspaceId: string,
): WorkspaceWorktreeEnvironment {
  return {
    workspaceId,
    setupScript: "",
    cleanupScript: "",
    updatedAt: null,
    proposal: null,
  };
}

// Proposed scripts run unattended in a login shell on every worktree create /
// recycle, so the review UI flags commands that warrant a closer look. This is
// a review aid, not a sandbox — matched labels are shown to the user verbatim.
const RISKY_SCRIPT_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  label: string;
}> = [
  {
    pattern: /\brm\s+(?:-[a-zA-Z-]+\s+)*-[a-zA-Z-]*[rf][a-zA-Z-]*/,
    label: "rm -rf",
  },
  { pattern: /\bsudo\b/, label: "sudo" },
  {
    pattern: /(?:curl|wget)[^\n|]*\|\s*(?:sudo\s+)?[a-z]*sh\b/,
    label: "pipe to shell",
  },
  { pattern: /\bchmod\s+(?:-R\s+)?777\b/, label: "chmod 777" },
  { pattern: /\bdd\s+if=/, label: "dd" },
  { pattern: /\bmkfs(?:\.[a-z0-9]+)?\b/, label: "mkfs" },
];

export function detectRiskyScriptPatterns(script: string): string[] {
  const matches = new Set<string>();
  for (const { pattern, label } of RISKY_SCRIPT_PATTERNS) {
    if (pattern.test(script)) {
      matches.add(label);
    }
  }
  return [...matches];
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
