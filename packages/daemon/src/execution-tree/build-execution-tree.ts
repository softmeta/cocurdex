import type {
  AgentSessionPlan,
  AgentToolCallRecord,
  ExecutionInteraction,
  ExecutionRunNode,
  ExecutionSessionNode,
  ExecutionToolCallNode,
  RunRecord,
  SessionExecutionTree,
  SessionInteractionSnapshot,
  SessionRecord,
} from "@cocurdex/shared";
import { findSpawningToolCall } from "./spawning-tool-call";

export interface ExecutionTreeSource {
  sessions: SessionRecord[];
  runs: Record<string, RunRecord[]>;
  toolCalls: Record<string, AgentToolCallRecord[]>;
  interactions: SessionInteractionSnapshot;
  plans: Record<string, AgentSessionPlan | null>;
}

interface BuildContext {
  childrenByParent: Map<string, SessionRecord[]>;
  interactionsBySession: Map<string, ExecutionInteraction[]>;
  source: ExecutionTreeSource;
  maxDepth: number;
  visited: Set<string>;
}

function groupBy<T>(items: T[], key: (item: T) => string | null | undefined) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    if (!value) continue;
    groups.set(value, [...(groups.get(value) ?? []), item]);
  }
  return groups;
}

function listInteractions(
  interactions: SessionInteractionSnapshot,
): ExecutionInteraction[] {
  return [
    ...interactions.permissions.map((record) => ({
      kind: "permission" as const,
      record,
    })),
    ...interactions.questions.map((record) => ({
      kind: "question" as const,
      record,
    })),
    ...interactions.planApprovals.map((record) => ({
      kind: "planApproval" as const,
      record,
    })),
  ];
}

function runContains(run: RunRecord, timestamp: string) {
  if (timestamp < run.startedAt) return false;
  return !run.endedAt || timestamp <= run.endedAt;
}

function summarizeSession(session: SessionRecord) {
  return {
    id: session.id,
    title: session.title,
    agentType: session.agentType,
    sessionKind: session.sessionKind,
    status: session.status,
    parentSessionId: session.parentSessionId ?? null,
    parentToolCallId: session.parentToolCallId ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

const MAX_INPUT_TEXT_LENGTH = 512;
const MAX_INPUT_DEPTH = 2;

function trimToolInput(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.slice(0, MAX_INPUT_TEXT_LENGTH);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value) || depth >= MAX_INPUT_DEPTH) return null;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      trimToolInput(entry, depth + 1),
    ]),
  );
}

function buildToolCallNode(
  toolCall: AgentToolCallRecord,
  child: ExecutionSessionNode | null,
): ExecutionToolCallNode {
  const subagent = toolCall.subagent ?? null;
  return {
    toolCall: {
      id: toolCall.id,
      title: toolCall.title,
      kind: toolCall.kind ?? null,
      status: toolCall.status,
      rawInput: trimToolInput(toolCall.rawInput),
      startedAt: toolCall.startedAt,
      updatedAt: toolCall.updatedAt,
    },
    subagent,
    child,
    observability: subagent && !child ? "limited" : "full",
  };
}

function buildSessionNode(
  session: SessionRecord,
  depth: number,
  context: BuildContext,
): ExecutionSessionNode {
  context.visited.add(session.id);
  const childSessions = (context.childrenByParent.get(session.id) ?? []).filter(
    (child) => !context.visited.has(child.id),
  );
  const expand = depth < context.maxDepth;
  const children = expand ? childSessions : [];
  for (const child of children) context.visited.add(child.id);

  const toolCalls = context.source.toolCalls[session.id] ?? [];
  const toolCallIds = new Set(toolCalls.map((toolCall) => toolCall.id));
  const runs = context.source.runs[session.id] ?? [];
  const runIds = new Set(runs.map((run) => run.id));
  const activeRun = runs.find((run) => run.status === "running") ?? null;

  const childNodes = new Map(
    children.map((child) => [
      child.id,
      buildSessionNode(child, depth + 1, context),
    ]),
  );
  const spawnedByToolCall = new Map<string, ExecutionSessionNode>();
  const delegatedByRun = new Map<string, ExecutionSessionNode[]>();
  const unattributed: ExecutionSessionNode[] = [];
  for (const child of children) {
    const node = childNodes.get(child.id);
    if (!node) continue;
    const toolCallId =
      child.parentToolCallId ??
      findSpawningToolCall(child, toolCalls, new Set(spawnedByToolCall.keys()))
        ?.id;
    if (toolCallId && toolCallIds.has(toolCallId)) {
      spawnedByToolCall.set(toolCallId, node);
      continue;
    }
    const run = runs.find((candidate) =>
      runContains(candidate, child.createdAt),
    );
    if (run) {
      delegatedByRun.set(run.id, [...(delegatedByRun.get(run.id) ?? []), node]);
      continue;
    }
    unattributed.push(node);
  }

  const toolCallNodes = toolCalls.map((toolCall) => ({
    runId: toolCall.runId && runIds.has(toolCall.runId) ? toolCall.runId : null,
    node: buildToolCallNode(
      toolCall,
      spawnedByToolCall.get(toolCall.id) ?? null,
    ),
  }));
  const interactions = context.interactionsBySession.get(session.id) ?? [];

  const runNodes: ExecutionRunNode[] = runs.map((run) => ({
    run,
    toolCalls: toolCallNodes
      .filter((entry) => entry.runId === run.id)
      .map((entry) => entry.node),
    delegated: delegatedByRun.get(run.id) ?? [],
    interactions: run === activeRun ? interactions : [],
  }));

  return {
    session: summarizeSession(session),
    runs: runNodes,
    toolCalls: toolCallNodes
      .filter((entry) => entry.runId === null)
      .map((entry) => entry.node),
    children: unattributed,
    interactions: activeRun ? [] : interactions,
    plan: context.source.plans[session.id] ?? null,
    truncated: !expand && childSessions.length > 0,
  };
}

export function buildExecutionTree(
  rootSessionId: string,
  source: ExecutionTreeSource,
  maxDepth: number,
): SessionExecutionTree | null {
  const root = source.sessions.find((session) => session.id === rootSessionId);
  if (!root) return null;

  const context: BuildContext = {
    childrenByParent: groupBy(
      source.sessions,
      (session) => session.parentSessionId,
    ),
    interactionsBySession: groupBy(
      listInteractions(source.interactions),
      (interaction) => interaction.record.sessionId,
    ),
    source,
    maxDepth,
    visited: new Set(),
  };
  return { root: buildSessionNode(root, 0, context), maxDepth };
}
