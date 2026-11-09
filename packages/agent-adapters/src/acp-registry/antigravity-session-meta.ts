import type { InitializeResponse } from "@agentclientprotocol/sdk/unstable";
import { compareAgentVersions, parseAgentVersion } from "@cocurdex/shared";

const RUN_WORKFLOW_SKILL_RELEASE_RANGE = ["1.4.2", "1.4.5"] as const;

/**
 * Antigravity 1.4.2 through 1.4.5 materialize `skills/system/run-workflow/SKILL.md`
 * into the session cwd unless the `run_workflow` tool is disabled. Older builds
 * leave the workspace alone, so the workaround stays scoped to that range.
 */
export function antigravityWritesRunWorkflowSkill(
  version: string | null | undefined,
): boolean {
  const parsed = parseAgentVersion(version);
  if (!parsed) {
    return false;
  }
  const [minimum, maximum] = RUN_WORKFLOW_SKILL_RELEASE_RANGE;
  return (
    compareAgentVersions(parsed, minimum) >= 0 &&
    compareAgentVersions(parsed, maximum) <= 0
  );
}

export function antigravitySessionMeta(
  initialized: InitializeResponse,
): Record<string, unknown> | undefined {
  return antigravityWritesRunWorkflowSkill(initialized.agentInfo?.version)
    ? { antigravity: { disabledTools: ["run_workflow"] } }
    : undefined;
}
