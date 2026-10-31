import { requestDaemon } from "@cocurdex/daemon/client";
import { type AgentId, isAgentId } from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import {
  type ParsedArgs,
  printResult,
  printRows,
  stringFlag,
} from "./parse-args";

export function sessionLineageUsageLines() {
  return [
    "  cocurdex session fork <session-id> [--through <message-id>] [--title <title>] [--json]",
    "  cocurdex session switch-agent <session-id> <agent> [--json]",
    "  cocurdex session handoffs <session-id> [--json]",
  ];
}

function requireAgentId(value: string | undefined): AgentId {
  if (!value || !isAgentId(value)) {
    throw new Error(
      "Usage: cocurdex session switch-agent <session-id> <agent>",
    );
  }
  return value;
}

export async function handleSessionLineageCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
) {
  const [sessionId] = args;
  if (action === "fork") {
    if (!sessionId)
      throw new Error("Usage: cocurdex session fork <session-id>");
    const fork = await withDaemon(() =>
      requestDaemon("session.fork", {
        sessionId,
        throughMessageId: stringFlag(parsed, "through"),
        title: stringFlag(parsed, "title"),
      }),
    );
    printResult(fork, parsed);
    return true;
  }
  if (action === "switch-agent") {
    if (!sessionId) {
      throw new Error(
        "Usage: cocurdex session switch-agent <session-id> <agent>",
      );
    }
    const agentType = requireAgentId(args[1]);
    const session = await withDaemon(() =>
      requestDaemon("session.switchAgent", { sessionId, agentType }),
    );
    printResult(session, parsed);
    return true;
  }
  if (action === "handoffs") {
    if (!sessionId) {
      throw new Error("Usage: cocurdex session handoffs <session-id>");
    }
    const transfers = await withDaemon(() =>
      requestDaemon("session.contextTransfers", { sessionId }),
    );
    if (parsed.flags.has("json")) {
      printResult(transfers, parsed);
      return true;
    }
    printRows(
      transfers.map((transfer) => ({
        id: transfer.id,
        kind: transfer.kind,
        status: transfer.status,
        from: transfer.sourceAgentTypes.join(",") || transfer.sourceSessionId,
        to: transfer.targetAgentType ?? "",
        strategy: transfer.strategy ?? "",
        messages: transfer.coveredMessageCount,
        createdAt: transfer.createdAt,
      })),
      [
        "id",
        "kind",
        "status",
        "from",
        "to",
        "strategy",
        "messages",
        "createdAt",
      ],
      parsed,
    );
    return true;
  }
  return false;
}
