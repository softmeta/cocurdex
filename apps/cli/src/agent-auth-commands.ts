import { requestDaemon } from "@cocurdex/daemon/client";
import {
  type AcpRegistryAgentId,
  type AcpRegistryAgentUpdate,
  type AgentAuthState,
  type AgentId,
  isAcpRegistryAgentId,
  isAgentId,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import { type ParsedArgs, printResult, stringFlag } from "./parse-args";

export function agentAuthUsageLines() {
  return [
    "  cocurdex agent auth <agent> [--json]",
    "  cocurdex agent login <agent> [--method <method-id>]",
    "  cocurdex agent login cancel <agent>",
    "  cocurdex agent logout <agent>",
    "  cocurdex agent updates [--refresh] [--json]",
    "  cocurdex agent update <agent> [--json]",
  ];
}

function requireAgentId(value: string | undefined, usage: string): AgentId {
  if (!value) throw new Error(`Usage: ${usage}`);
  if (!isAgentId(value)) throw new Error(`Unknown agent: ${value}`);
  return value;
}

function requireRegistryAgentId(
  value: string | undefined,
  usage: string,
): AcpRegistryAgentId {
  const agentId = requireAgentId(value, usage);
  if (!isAcpRegistryAgentId(agentId)) {
    throw new Error(`Agent ${agentId} has no ACP sign-in`);
  }
  return agentId;
}

export function formatAgentAuthLines(state: AgentAuthState) {
  const current = state.preferredMethodId ?? state.loginMethodId;
  return [
    ...state.methods.map((method) => {
      const marker = method.id === current ? "*" : " ";
      return `${marker} ${method.id.padEnd(20)} ${method.name}`;
    }),
    `logout         ${state.logoutSupported ? "supported" : "not supported"}`,
    `live sessions  ${state.liveSessionCount}`,
  ];
}

function formatAgentUpdateLines(updates: AcpRegistryAgentUpdate[]) {
  if (updates.length === 0) {
    return ["All registry agents are up to date"];
  }
  return updates.map(
    (update) =>
      `${update.agentId.padEnd(24)} ${update.installedVersion} -> ${update.latestVersion}`,
  );
}

export async function handleAgentCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
) {
  if (action === "auth") {
    const agentId = requireRegistryAgentId(
      args[0],
      "cocurdex agent auth <agent>",
    );
    const state = await withDaemon(() =>
      requestDaemon("agent.auth.read", { agentId }),
    );
    if (parsed.flags.has("json")) {
      printResult(state, parsed);
      return true;
    }
    for (const line of formatAgentAuthLines(state)) {
      console.log(line);
    }
    return true;
  }
  if (action === "login" && args[0] === "cancel") {
    const agentId = requireAgentId(
      args[1],
      "cocurdex agent login cancel <agent>",
    );
    await withDaemon(() => requestDaemon("agent.login.cancel", { agentId }));
    printResult({ cancelled: true, agentId }, parsed);
    return true;
  }
  if (action === "login") {
    const agentId = requireAgentId(args[0], "cocurdex agent login <agent>");
    const methodId = stringFlag(parsed, "method");
    await withDaemon(() => requestDaemon("agent.login", { agentId, methodId }));
    printResult({ loggedIn: true, agentId, methodId }, parsed);
    return true;
  }
  if (action === "updates") {
    const updates = await withDaemon(() =>
      requestDaemon("acpRegistry.updates", {
        forceRefresh: parsed.flags.has("refresh"),
      }),
    );
    if (parsed.flags.has("json")) {
      printResult(updates, parsed);
      return true;
    }
    for (const line of formatAgentUpdateLines(updates)) {
      console.log(line);
    }
    return true;
  }
  if (action === "update") {
    const agentId = requireRegistryAgentId(
      args[0],
      "cocurdex agent update <agent>",
    );
    const agent = await withDaemon(() =>
      requestDaemon("acpRegistry.update", { agentId }),
    );
    printResult(
      parsed.flags.has("json")
        ? agent
        : { updated: true, agentId, version: agent.version },
      parsed,
    );
    return true;
  }
  if (action === "logout") {
    const agentId = requireRegistryAgentId(
      args[0],
      "cocurdex agent logout <agent>",
    );
    await withDaemon(() => requestDaemon("agent.logout", { agentId }));
    printResult({ loggedOut: true, agentId }, parsed);
    return true;
  }
  return false;
}
