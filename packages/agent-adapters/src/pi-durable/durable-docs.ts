import type { AgentRunPolicy } from "@cocurdex/agent-core";
import { defineDoc } from "@earendil-works/pi-durable";

/**
 * What the daemon hands a conversation for its next run, committed with the input so a run the
 * Harness resumes after a restart renders the same prompt and enforces the same policy.
 */
export type CocurdexRunState = {
  sections: Record<string, string>;
  workspaceRoots: string[];
  policy: {
    allowedTools: string[] | null;
    blockedToolReason: string;
    requiredTool: { name: string; reminder: string } | null;
  } | null;
};

export const CocurdexRunDoc = defineDoc<CocurdexRunState>({
  kind: "cocurdex.run",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ sections: {}, workspaceRoots: [], policy: null }),
  checkpointWhen: () => true,
});

/**
 * Ties a conversation to the provider state that names it. Conversation IDs count up per
 * database, so a recreated or different `pi-durable.sqlite` can hold an unrelated conversation
 * under a stored ID; a session only resumes a conversation whose key matches its own.
 */
export const CocurdexBindingDoc = defineDoc<{ key: string | null }>({
  kind: "cocurdex.binding",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ key: null }),
  checkpointWhen: () => true,
});

export function runPolicyState(
  policy: AgentRunPolicy | null | undefined,
): CocurdexRunState["policy"] {
  if (!policy) return null;
  return {
    allowedTools: policy.allowedTools ? [...policy.allowedTools] : null,
    blockedToolReason: policy.blockedToolReason,
    requiredTool: policy.requiredTool ? { ...policy.requiredTool } : null,
  };
}
