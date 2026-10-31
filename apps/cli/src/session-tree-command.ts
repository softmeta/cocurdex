import { requestDaemon } from "@cocurdex/daemon/client";
import type {
  ExecutionInteraction,
  ExecutionRunNode,
  ExecutionSessionNode,
  ExecutionToolCallNode,
  SessionExecutionTree,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import { type ParsedArgs, printResult, stringFlag } from "./parse-args";

export function sessionTreeUsageLines() {
  return ["  cocurdex session tree <session-id> [--depth <n>] [--json]"];
}

function indent(depth: number) {
  return "  ".repeat(depth);
}

function interactionLine(interaction: ExecutionInteraction) {
  if (interaction.kind === "permission") {
    return `waiting for permission: ${interaction.record.title}`;
  }
  if (interaction.kind === "question") {
    return `waiting for answer: ${interaction.record.question}`;
  }
  return "waiting for plan approval";
}

function toolCallLines(node: ExecutionToolCallNode, depth: number): string[] {
  const lines = [
    `${indent(depth)}tool ${node.toolCall.title} [${node.toolCall.status}]`,
  ];
  if (node.child) return [...lines, ...sessionLines(node.child, depth + 1)];
  if (node.observability === "limited") {
    lines.push(
      `${indent(depth + 1)}subagent ${node.subagent?.description || node.subagent?.sessionId} (not observable: provider reported no session events)`,
    );
  }
  return lines;
}

function runLines(node: ExecutionRunNode, depth: number): string[] {
  return [
    `${indent(depth)}run ${node.run.id} [${node.run.status}] ${node.run.startedAt}`,
    ...node.toolCalls.flatMap((toolCall) => toolCallLines(toolCall, depth + 1)),
    ...node.delegated.flatMap((child) => sessionLines(child, depth + 1)),
    ...node.interactions.map(
      (interaction) => `${indent(depth + 1)}${interactionLine(interaction)}`,
    ),
  ];
}

function sessionLines(node: ExecutionSessionNode, depth: number): string[] {
  const { session } = node;
  const kind = session.sessionKind ?? "main";
  const lines = [
    `${indent(depth)}session ${session.title} (${kind}, ${session.agentType}) [${session.status}] ${session.id}`,
  ];
  if (node.plan) {
    const done = node.plan.steps.filter(
      (step) => step.status === "completed",
    ).length;
    lines.push(
      `${indent(depth + 1)}plan ${done}/${node.plan.steps.length} steps done`,
    );
  }
  return [
    ...lines,
    ...node.runs.flatMap((run) => runLines(run, depth + 1)),
    ...node.toolCalls.flatMap((toolCall) => toolCallLines(toolCall, depth + 1)),
    ...node.children.flatMap((child) => sessionLines(child, depth + 1)),
    ...node.interactions.map(
      (interaction) => `${indent(depth + 1)}${interactionLine(interaction)}`,
    ),
    ...(node.truncated
      ? [`${indent(depth + 1)}deeper sessions omitted (raise --depth)`]
      : []),
  ];
}

export function formatExecutionTree(tree: SessionExecutionTree): string {
  return sessionLines(tree.root, 0).join("\n");
}

function depthFlag(parsed: ParsedArgs) {
  const value = stringFlag(parsed, "depth");
  if (value === undefined) return undefined;
  const depth = Number(value);
  if (!Number.isInteger(depth) || depth < 1) {
    throw new Error("--depth must be a positive integer");
  }
  return depth;
}

export async function handleSessionTreeCommand(
  sessionId: string | undefined,
  parsed: ParsedArgs,
) {
  if (!sessionId) {
    throw new Error("Usage: cocurdex session tree <session-id>");
  }
  const tree = await withDaemon(() =>
    requestDaemon("session.executionTree", {
      sessionId,
      maxDepth: depthFlag(parsed),
    }),
  );
  if (!tree) throw new Error(`Session not found: ${sessionId}`);
  if (parsed.flags.has("json")) {
    printResult(tree, parsed);
    return;
  }
  console.log(formatExecutionTree(tree));
}
