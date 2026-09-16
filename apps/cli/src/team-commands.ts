import { requestDaemon } from "@cocurdex/daemon/client";
import type { AgentId } from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import {
  getRequiredFlag,
  type ParsedArgs,
  printResult,
  printRows,
  stringFlag,
} from "./parse-args";

export function teamUsageLines() {
  return [
    "  cocurdex team get --lead <session-id> [--json]",
    "  cocurdex team spawn --lead <session-id> --name <name> --prompt <prompt> [--role <role-id>] [--agent <agent>] [--worktree]",
    "  cocurdex team stop --team <team-id>",
    "  cocurdex team stop-member --team <team-id> --session <session-id>",
  ];
}

export async function handleTeamCommand(
  action: string | undefined,
  parsed: ParsedArgs,
): Promise<boolean> {
  if (action === "get") {
    const snapshot = await withDaemon(() =>
      requestDaemon("team.get", {
        leadSessionId: getRequiredFlag(parsed, "lead"),
      }),
    );
    if (!snapshot) {
      throw new Error("No team for this lead session");
    }
    if (parsed.flags.has("json")) {
      printResult(snapshot, parsed);
      return true;
    }
    printResult(snapshot.team, parsed);
    printRows(snapshot.members, ["sessionId", "name", "status"], parsed);
    return true;
  }

  if (action === "spawn") {
    const member = await withDaemon(() =>
      requestDaemon("team.spawn", {
        leadSessionId: getRequiredFlag(parsed, "lead"),
        name: getRequiredFlag(parsed, "name"),
        prompt: getRequiredFlag(parsed, "prompt"),
        agentRoleId: stringFlag(parsed, "role") ?? null,
        agentType: stringFlag(parsed, "agent") as AgentId | undefined,
        isolateWorktree: parsed.flags.has("worktree"),
      }),
    );
    printResult(member, parsed);
    return true;
  }

  if (action === "stop") {
    const team = await withDaemon(() =>
      requestDaemon("team.stop", { teamId: getRequiredFlag(parsed, "team") }),
    );
    printResult(team, parsed);
    return true;
  }

  if (action === "stop-member") {
    const member = await withDaemon(() =>
      requestDaemon("team.stopMember", {
        teamId: getRequiredFlag(parsed, "team"),
        sessionId: getRequiredFlag(parsed, "session"),
      }),
    );
    printResult(member, parsed);
    return true;
  }

  return false;
}
