import { readFile } from "node:fs/promises";
import { requestDaemon } from "@cocurdex/daemon/client";
import {
  type AgentId,
  isAgentId,
  type MessageRecord,
  type PersonalAgentRecord,
  type PersonalAgentRolePayload,
  personalAgentRoleDraft,
  type SessionObservationSnapshot,
  type UpdatePersonalAgentPayload,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import {
  getRequiredFlag,
  type ParsedArgs,
  printResult,
  printRows,
  stringFlag,
} from "./parse-args";

const POLL_INTERVAL_MS = 500;
const DEFAULT_WAIT_SECONDS = 600;
const DEFAULT_THREAD_LIMIT = 20;

export function personaUsageLines() {
  return [
    "  cocurdex persona list [--json]",
    "  cocurdex persona show <persona> [--json]",
    "  cocurdex persona create --name <name> [--agent <agent>] [--provider <id> --model <id>] [--description <text>] [--instructions <text>|--instructions-file <path>] [--soul <text>|--soul-file <path>] [--json]",
    "  cocurdex persona update <persona> [--name <name>] [--agent <agent>] [--provider <id> --model <id>] [--description <text>] [--instructions <text>|--instructions-file <path>] [--soul <text>|--soul-file <path>] [--pin|--unpin] [--mute|--unmute] [--json]",
    "  cocurdex persona duplicate <persona> --name <name> [--json]",
    "  cocurdex persona delete <persona>",
    "  cocurdex persona send <persona> <message> [--wait] [--timeout <seconds>] [--json]",
    "  cocurdex persona thread <persona> [--limit <n>] [--json]",
  ];
}

function personaRow(agent: PersonalAgentRecord) {
  return {
    id: agent.id,
    name: agent.role.name,
    agent: agent.role.agentId,
    model: agent.role.modelId ?? "",
    default: agent.isDefault,
    pinned: agent.pinnedAt !== null,
    muted: agent.mutedAt !== null,
    homeSessionId: agent.homeSessionId,
  };
}

function resolvePersona(
  agents: readonly PersonalAgentRecord[],
  ref: string,
): PersonalAgentRecord {
  const exact = agents.find((agent) => agent.id === ref);
  if (exact) return exact;
  const lowered = ref.toLocaleLowerCase();
  const matches = agents.filter(
    (agent) =>
      agent.id.startsWith(ref) ||
      agent.role.name.toLocaleLowerCase() === lowered,
  );
  if (matches.length === 1 && matches[0]) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `Persona "${ref}" is ambiguous: ${matches.map((agent) => agent.id).join(", ")}`,
    );
  }
  throw new Error(`Persona "${ref}" was not found`);
}

async function textFlag(parsed: ParsedArgs, name: string) {
  const file = stringFlag(parsed, `${name}-file`);
  if (file) return readFile(file, "utf8");
  const value = parsed.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function agentFlag(parsed: ParsedArgs): AgentId | undefined {
  const value = stringFlag(parsed, "agent");
  if (value === undefined) return undefined;
  if (!isAgentId(value)) throw new Error(`Unknown agent: ${value}`);
  return value;
}

async function roleChanges(parsed: ParsedArgs) {
  const provider = stringFlag(parsed, "provider");
  const model = stringFlag(parsed, "model");
  if (Boolean(provider) !== Boolean(model)) {
    throw new Error("Pass --provider and --model together");
  }
  const changes: Partial<PersonalAgentRolePayload> = {};
  const name = stringFlag(parsed, "name");
  const agentId = agentFlag(parsed);
  const description = parsed.flags.get("description");
  const instructions = await textFlag(parsed, "instructions");
  if (name !== undefined) changes.name = name;
  if (agentId !== undefined) changes.agentId = agentId;
  if (provider && model) {
    changes.providerId = provider;
    changes.modelId = model;
    changes.modelName = null;
  }
  if (typeof description === "string") changes.description = description;
  if (instructions !== undefined) changes.instructions = instructions;
  return changes;
}

function toggleFlag(parsed: ParsedArgs, on: string, off: string) {
  if (parsed.flags.has(on) && parsed.flags.has(off)) {
    throw new Error(`Pass either --${on} or --${off}`);
  }
  if (parsed.flags.has(on)) return true;
  if (parsed.flags.has(off)) return false;
  return undefined;
}

function rolePayload(agent: PersonalAgentRecord): PersonalAgentRolePayload {
  const {
    id: _id,
    createdAt: _created,
    updatedAt: _updated,
    ...role
  } = agent.role;
  return role;
}

function listPersonas() {
  return requestDaemon("personalAgent.list");
}

async function findPersona(args: string[], usage: string) {
  const ref = args[0];
  if (!ref) throw new Error(`Usage: ${usage}`);
  return resolvePersona(await listPersonas(), ref);
}

function responsesAfter(messages: readonly MessageRecord[], messageId: string) {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 0) return [];
  return messages
    .slice(index + 1)
    .filter(
      (message) => message.role === "assistant" && message.kind === "response",
    );
}

function turnError(messages: readonly MessageRecord[], messageId: string) {
  const index = messages.findIndex((message) => message.id === messageId);
  const notice = messages
    .slice(index + 1)
    .findLast((message) => message.role === "system");
  return notice?.content || "The persona's turn failed";
}

function turnSettled(snapshot: SessionObservationSnapshot, messageId: string) {
  if (snapshot.session.status === "error") return true;
  if (snapshot.session.status === "running" || snapshot.activeRun) {
    return false;
  }
  if (snapshot.queuedAgentInputs.some((input) => input.messageId === messageId))
    return false;
  return responsesAfter(snapshot.messages, messageId).length > 0;
}

async function waitForReply(
  sessionId: string,
  messageId: string,
  timeoutSeconds: number,
) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const snapshot = await requestDaemon("session.snapshot", { sessionId });
    if (snapshot && turnSettled(snapshot, messageId)) {
      const replies = responsesAfter(snapshot.messages, messageId);
      const reply = replies.map((message) => message.content).join("\n\n");
      if (snapshot.session.status === "error") {
        throw new Error(turnError(snapshot.messages, messageId));
      }
      return { status: snapshot.session.status, reply };
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(
    `No reply within ${timeoutSeconds}s; read it later with persona thread`,
  );
}

function positiveNumberFlag(
  parsed: ParsedArgs,
  name: string,
  fallback: number,
) {
  const value = stringFlag(parsed, name);
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`--${name} must be a positive number`);
  }
  return number;
}

async function sendToPersona(args: string[], parsed: ParsedArgs) {
  const usage = "cocurdex persona send <persona> <message>";
  const content = args[1];
  if (!content) throw new Error(`Usage: ${usage}`);
  const timeout = positiveNumberFlag(parsed, "timeout", DEFAULT_WAIT_SECONDS);
  const result = await withDaemon(async () => {
    const agent = await findPersona(args, usage);
    const messageId = crypto.randomUUID();
    await requestDaemon("session.send", {
      sessionId: agent.homeSessionId,
      messageId,
      content,
    });
    const sent = {
      persona: agent.id,
      sessionId: agent.homeSessionId,
      messageId,
    };
    if (!parsed.flags.has("wait")) return sent;
    return {
      ...sent,
      ...(await waitForReply(agent.homeSessionId, messageId, timeout)),
    };
  });
  if (!parsed.flags.has("json") && "reply" in result) {
    console.log(result.reply);
    return;
  }
  printResult(result, parsed);
}

async function readThread(args: string[], parsed: ParsedArgs) {
  const limit = positiveNumberFlag(parsed, "limit", DEFAULT_THREAD_LIMIT);
  const messages = await withDaemon(async () => {
    const agent = await findPersona(args, "cocurdex persona thread <persona>");
    const snapshot = await requestDaemon("session.snapshot", {
      sessionId: agent.homeSessionId,
    });
    return (snapshot?.messages ?? []).filter(
      (message) =>
        message.role === "user" ||
        (message.role === "assistant" && message.kind === "response"),
    );
  });
  printRows(
    messages.slice(-limit).map((message) => ({
      id: message.id,
      role: message.role,
      createdAt: message.createdAt,
      content: message.content,
    })),
    ["role", "createdAt", "content"],
    parsed,
  );
}

async function createPersona(parsed: ParsedArgs) {
  const changes = await roleChanges(parsed);
  const name = getRequiredFlag(parsed, "name");
  const soul = await textFlag(parsed, "soul");
  return withDaemon(() =>
    requestDaemon("personalAgent.create", {
      role: { ...personalAgentRoleDraft(name), ...changes },
      soul: soul ?? null,
    }),
  );
}

async function updatePersona(args: string[], parsed: ParsedArgs) {
  const changes = await roleChanges(parsed);
  const soul = await textFlag(parsed, "soul");
  const pinned = toggleFlag(parsed, "pin", "unpin");
  const muted = toggleFlag(parsed, "mute", "unmute");
  return withDaemon(async () => {
    const agent = await findPersona(args, "cocurdex persona update <persona>");
    const payload: UpdatePersonalAgentPayload = { id: agent.id };
    if (Object.keys(changes).length > 0) {
      payload.role = { ...rolePayload(agent), ...changes };
    }
    if (soul !== undefined) payload.soul = soul;
    if (pinned !== undefined) payload.pinned = pinned;
    if (muted !== undefined) payload.muted = muted;
    return requestDaemon("personalAgent.update", payload);
  });
}

export async function handlePersonaCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
): Promise<boolean> {
  if (action === "list" || action === undefined) {
    const agents = await withDaemon(listPersonas);
    printRows(
      agents.map(personaRow),
      ["id", "name", "agent", "default", "pinned", "muted"],
      parsed,
    );
    return true;
  }
  if (action === "show") {
    const agent = await withDaemon(() =>
      findPersona(args, "cocurdex persona show <persona>"),
    );
    printResult(agent, parsed);
    return true;
  }
  if (action === "create") {
    printResult(await createPersona(parsed), parsed);
    return true;
  }
  if (action === "update") {
    printResult(await updatePersona(args, parsed), parsed);
    return true;
  }
  if (action === "duplicate") {
    const name = getRequiredFlag(parsed, "name");
    const copy = await withDaemon(async () => {
      const agent = await findPersona(
        args,
        "cocurdex persona duplicate <persona> --name <name>",
      );
      return requestDaemon("personalAgent.duplicate", { id: agent.id, name });
    });
    printResult(copy, parsed);
    return true;
  }
  if (action === "delete") {
    const deleted = await withDaemon(async () => {
      const agent = await findPersona(
        args,
        "cocurdex persona delete <persona>",
      );
      await requestDaemon("personalAgent.delete", { id: agent.id });
      return { deleted: agent.id };
    });
    printResult(deleted, parsed);
    return true;
  }
  if (action === "send") {
    await sendToPersona(args, parsed);
    return true;
  }
  if (action === "thread") {
    await readThread(args, parsed);
    return true;
  }
  return false;
}
