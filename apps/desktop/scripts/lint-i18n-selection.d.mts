export type LintInputSelection = {
  input: string[];
  reason: string;
};

export function selectLintInput(options: {
  desktopRoot: string;
  files: string[];
  forceFull: boolean;
  repoRoot?: string;
}): Promise<LintInputSelection>;
