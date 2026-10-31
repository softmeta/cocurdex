import { type AgentToolCatalog, agentToolFullName } from "@cocurdex/shared";

const ORCHESTRATION_INSTRUCTIONS = [
  "Cocurdex delegation: pick the lightest option that fits, and do the work yourself when it fits in your own turn.",
  "- Your provider's native subagent tool (for example Claude's Agent tool or Codex's spawn agent), when you have one: focused delegation on your own provider where only the result matters. It is the cheapest option.",
  "- team_spawn_teammate: work that needs another provider or a saved agent role, an isolated git worktree, a shared task list with blockedBy dependencies, or a session the user can see and message in the sidebar.",
  "- script_run_propose: deterministic fan-out over many items or a fixed pipeline of agents; the user approves the script before it runs.",
  "- messaging_send_message: talk to sessions that already exist, never to start delegated work.",
].join("\n");

const DELEGATION_TOOLS = new Set(["team_spawn_teammate", "script_run_propose"]);

export function orchestrationInstructions(catalog: AgentToolCatalog) {
  const canDelegate = catalog.tools.some((tool) =>
    DELEGATION_TOOLS.has(agentToolFullName(tool)),
  );
  return canDelegate ? ORCHESTRATION_INSTRUCTIONS : undefined;
}
