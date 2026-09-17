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
    "  cocurdex team roles [--json]",
    "  cocurdex team templates [--json]",
    "  cocurdex team spawn-template --lead <session-id> --template <template-id> [--prompt <prompt>]",
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

  if (action === "roles") {
    const roles = await withDaemon(() => requestDaemon("agentRole.list"));
    printRows(roles, ["id", "name", "agentId", "modelName"], parsed);
    return true;
  }

  if (action === "templates") {
    const templates = await withDaemon(() =>
      requestDaemon("teamTemplate.list"),
    );
    if (parsed.flags.has("json")) {
      printResult(templates, parsed);
      return true;
    }
    printRows(
      templates.map((template) => ({
        id: template.id,
        name: template.name,
        members: template.members.map((member) => member.name).join(","),
      })),
      ["id", "name", "members"],
      parsed,
    );
    return true;
  }

  if (action === "spawn-template") {
    const members = await withDaemon(() =>
      requestDaemon("team.spawnTemplate", {
        leadSessionId: getRequiredFlag(parsed, "lead"),
        templateId: getRequiredFlag(parsed, "template"),
        prompt: stringFlag(parsed, "prompt"),
      }),
    );
    printRows(members, ["sessionId", "name", "status"], parsed);
    return true;
  }

  return false;
}
