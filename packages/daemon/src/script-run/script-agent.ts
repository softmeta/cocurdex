import {
  type AgentRoleRecord,
  extractJsonReply,
  type MessageRecord,
  type ScriptAgentOptions,
  type ScriptRunAgentRecord,
  type ScriptRunRecord,
  type SendSessionCommand,
  type SessionRecord,
} from "@cocurdex/shared";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import type { SessionTurnOutcome } from "../session-control";
import type { ConcurrencyGate } from "./concurrency-gate";

export type ScriptRunAbortReason =
  | { kind: "cancelled"; notifyRequester: boolean }
  | { kind: "failed"; error: string }
  | { kind: "shutdown" };

export interface ScriptAgentDeps {
  getAgentRole(id: string): Promise<AgentRoleRecord | null>;
  saveSession(session: SessionRecord): Promise<void>;
  saveAgent(agent: ScriptRunAgentRecord): Promise<void>;
  createWorktree?(input: {
    workspaceId: string;
    branch: string;
  }): Promise<{ path: string }>;
  sendSessionMessage(command: SendSessionCommand): Promise<MessageRecord>;
  waitForSessionTurn(sessionId: string): Promise<SessionTurnOutcome | null>;
  now(): string;
  createId(): string;
}

export interface ScriptAgentRun {
  run: ScriptRunRecord;
  requester: SessionRecord;
  schemaMaxAttempts: number;
  gate: ConcurrencyGate;
  signal: AbortSignal;
  activeSessionIds: Set<string>;
  abort(reason: ScriptRunAbortReason): void;
  onChanged(): Promise<void>;
}

const schemaValidator = new AjvJsonSchemaValidator();

function schemaInstruction(schema: Record<string, unknown>) {
  return [
    "",
    "Reply with only a JSON value that matches this JSON Schema, with no other text:",
    "```json",
    JSON.stringify(schema, null, 2),
    "```",
  ].join("\n");
}

function parseOptions(raw: Record<string, unknown>): ScriptAgentOptions {
  const schema = raw.schema;
  if (
    schema !== undefined &&
    (typeof schema !== "object" || schema === null || Array.isArray(schema))
  ) {
    throw new TypeError("agent() schema must be a JSON Schema object.");
  }
  return {
    ...(typeof raw.label === "string" ? { label: raw.label } : {}),
    ...(typeof raw.agentRoleId === "string"
      ? { agentRoleId: raw.agentRoleId }
      : {}),
    ...(schema ? { schema: schema as Record<string, unknown> } : {}),
    ...(raw.worktree === true ? { worktree: true } : {}),
  };
}

async function createAgentSession(
  deps: ScriptAgentDeps,
  context: ScriptAgentRun,
  options: ScriptAgentOptions,
  label: string,
): Promise<SessionRecord> {
  const { requester, run } = context;
  const role = options.agentRoleId
    ? await deps.getAgentRole(options.agentRoleId)
    : null;
  if (options.agentRoleId && !role) {
    throw new Error(`Agent role ${options.agentRoleId} was not found.`);
  }
  const id = deps.createId();
  const worktreePath =
    options.worktree && deps.createWorktree
      ? (
          await deps.createWorktree({
            workspaceId: requester.workspaceId,
            branch: `script/${run.name}-${id.slice(0, 8)}`,
          })
        ).path
      : (requester.worktreePath ?? null);
  const agentType = role?.agentId ?? requester.agentType;
  const now = deps.now();
  const session: SessionRecord = {
    id,
    workspaceId: requester.workspaceId,
    title: label,
    agentType,
    sessionKind: "subagent",
    parentSessionId: requester.id,
    parentToolCallId: null,
    status: "idle",
    writeMode: requester.writeMode,
    sessionModeId: role?.sessionModeId ?? null,
    permissionMode: role?.permissionMode ?? requester.permissionMode,
    agentRoleId: role?.id ?? null,
    providerSnapshot:
      agentType === requester.agentType
        ? (requester.providerSnapshot ?? null)
        : null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    archivedAt: null,
    worktreePath,
  };
  await deps.saveSession(session);
  return session;
}

async function runTurn(
  deps: ScriptAgentDeps,
  sessionId: string,
  content: string,
): Promise<SessionTurnOutcome> {
  await deps.sendSessionMessage({
    sessionId,
    content,
    delivery: "start-new-run",
  });
  return (
    (await deps.waitForSessionTurn(sessionId)) ?? {
      status: "failed",
      error: "The agent turn did not start.",
    }
  );
}

async function converse(
  deps: ScriptAgentDeps,
  context: ScriptAgentRun,
  sessionId: string,
  prompt: string,
  schema: Record<string, unknown> | undefined,
): Promise<{ value: unknown } | { error: string; cancelled?: true }> {
  const validate = schema ? schemaValidator.getValidator(schema) : null;
  let outcome = await runTurn(
    deps,
    sessionId,
    schema ? `${prompt}\n${schemaInstruction(schema)}` : prompt,
  );
  for (let attempt = 1; ; attempt += 1) {
    if (outcome.status === "cancelled") {
      return { error: "Cancelled", cancelled: true };
    }
    if (outcome.status === "failed") return { error: outcome.error };
    if (!validate) return { value: outcome.message.content };
    const parsed = extractJsonReply(outcome.message.content);
    const checked = parsed.ok ? validate(parsed.value) : null;
    if (checked?.valid) return { value: checked.data };
    const problem = checked
      ? checked.errorMessage
      : "the reply did not contain JSON";
    if (attempt >= context.schemaMaxAttempts || context.signal.aborted) {
      return { error: `Reply did not match the schema: ${problem}` };
    }
    outcome = await runTurn(
      deps,
      sessionId,
      `Your reply did not match the required JSON Schema (${problem}). Reply again with only the JSON value.`,
    );
  }
}

export async function runScriptAgent(
  deps: ScriptAgentDeps,
  context: ScriptAgentRun,
  prompt: string,
  rawOptions: Record<string, unknown>,
): Promise<unknown> {
  const options = parseOptions(rawOptions);
  if (options.schema) schemaValidator.getValidator(options.schema);
  const { run } = context;
  if (run.agentCount >= run.maxAgents) {
    context.abort({
      kind: "failed",
      error: `Agent limit of ${run.maxAgents} reached.`,
    });
    return null;
  }
  run.agentCount += 1;
  const label = options.label?.trim() || `agent-${run.agentCount}`;
  await context.onChanged();

  return context.gate.run(async () => {
    if (context.signal.aborted) return null;
    const session = await createAgentSession(deps, context, options, label);
    const agent: ScriptRunAgentRecord = {
      id: deps.createId(),
      runId: run.id,
      sessionId: session.id,
      label,
      status: "running",
      resultJson: null,
      error: null,
      createdAt: deps.now(),
      completedAt: null,
    };
    await deps.saveAgent(agent);
    await context.onChanged();
    context.activeSessionIds.add(session.id);
    try {
      const result = await converse(
        deps,
        context,
        session.id,
        prompt,
        options.schema,
      );
      const finished: ScriptRunAgentRecord =
        "value" in result
          ? {
              ...agent,
              status: "completed",
              resultJson: JSON.stringify(result.value ?? null),
              completedAt: deps.now(),
            }
          : {
              ...agent,
              status: result.cancelled ? "cancelled" : "failed",
              error: result.error,
              completedAt: deps.now(),
            };
      await deps.saveAgent(finished);
      await context.onChanged();
      return "value" in result ? result.value : null;
    } finally {
      context.activeSessionIds.delete(session.id);
    }
  });
}
