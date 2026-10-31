import type {
  ExecutionInteraction,
  ExecutionRunNode,
  ExecutionSessionNode,
  ExecutionToolCallNode,
  RunRecord,
  SessionExecutionTree,
} from "@cocurdex/shared";

export interface ExecutionCallSummary {
  toolCount: number;
  failedCount: number;
  waitingCount: number;
}

interface Expandable {
  key: string;
  depth: number;
  summary: ExecutionCallSummary;
  expandable: boolean;
  expanded: boolean;
}

export type ExecutionTreeRow =
  | (Expandable & {
      kind: "session";
      node: ExecutionSessionNode;
      showAgent: boolean;
    })
  | (Expandable & { kind: "run"; run: RunRecord })
  | (Expandable & { kind: "toolGroup" })
  | {
      kind: "toolCall";
      key: string;
      depth: number;
      node: ExecutionToolCallNode;
    }
  | {
      kind: "interaction";
      key: string;
      depth: number;
      interaction: ExecutionInteraction;
    }
  | { kind: "truncated"; key: string; depth: number };

export type ExpandableExecutionTreeRow = Extract<
  ExecutionTreeRow,
  { expanded: boolean }
>;

export interface ExecutionTreeView {
  expansion: ReadonlyMap<string, boolean>;
  issuesOnly: boolean;
}

export const DEFAULT_EXECUTION_TREE_VIEW: ExecutionTreeView = {
  expansion: new Map(),
  issuesOnly: false,
};

function isFailedToolCall(node: ExecutionToolCallNode) {
  return node.toolCall.status === "failed";
}

function sessionHasIssues(node: ExecutionSessionNode): boolean {
  return (
    node.interactions.length > 0 ||
    node.runs.some(runHasIssues) ||
    node.toolCalls.some(toolCallHasIssues) ||
    node.children.some(sessionHasIssues)
  );
}

function toolCallHasIssues(node: ExecutionToolCallNode): boolean {
  return (
    isFailedToolCall(node) ||
    (node.child ? sessionHasIssues(node.child) : false)
  );
}

function runHasIssues(node: ExecutionRunNode): boolean {
  return (
    node.run.status === "failed" ||
    node.interactions.length > 0 ||
    node.toolCalls.some(toolCallHasIssues) ||
    node.delegated.some(sessionHasIssues)
  );
}

function summarizeCalls(
  toolCalls: ExecutionToolCallNode[],
  waitingCount: number,
): ExecutionCallSummary {
  return {
    toolCount: toolCalls.length,
    failedCount: toolCalls.filter(isFailedToolCall).length,
    waitingCount,
  };
}

function summarizeSession(node: ExecutionSessionNode) {
  const runs = node.runs;
  return summarizeCalls(
    [...node.toolCalls, ...runs.flatMap((run) => run.toolCalls)],
    node.interactions.length +
      runs.reduce((count, run) => count + run.interactions.length, 0),
  );
}

function isSessionExpandedByDefault(node: ExecutionSessionNode, depth: number) {
  return (
    depth === 0 ||
    node.session.status === "running" ||
    summarizeSession(node).waitingCount > 0
  );
}

function isRunExpandedByDefault(node: ExecutionRunNode, isLatest: boolean) {
  return (
    isLatest ||
    node.run.status === "running" ||
    node.run.status === "failed" ||
    node.interactions.length > 0
  );
}

class RowBuilder {
  constructor(private readonly view: ExecutionTreeView) {}

  private isExpanded(key: string, children: unknown[], byDefault: boolean) {
    if (children.length === 0) return false;
    return this.view.expansion.get(key) ?? (this.view.issuesOnly || byDefault);
  }

  session(
    node: ExecutionSessionNode,
    depth: number,
    parentAgent: string | null,
  ): ExecutionTreeRow[] {
    const key = `session:${node.session.id}`;
    const children = this.sessionChildren(node, depth);
    const expanded = this.isExpanded(
      key,
      children,
      isSessionExpandedByDefault(node, depth),
    );
    const row: ExecutionTreeRow = {
      kind: "session",
      key,
      depth,
      node,
      showAgent: node.session.agentType !== parentAgent,
      summary: summarizeSession(node),
      expandable: children.length > 0,
      expanded,
    };
    return expanded ? [row, ...children] : [row];
  }

  private sessionChildren(node: ExecutionSessionNode, depth: number) {
    const { issuesOnly } = this.view;
    const runs = issuesOnly ? node.runs.filter(runHasIssues) : node.runs;
    const latestRunId = node.runs.at(-1)?.run.id;
    const nested = [
      ...runs.flatMap((run) =>
        this.run(run, {
          depth: depth + 1,
          isLatest: run.run.id === latestRunId,
          agent: node.session.agentType,
        }),
      ),
      ...this.sessions(node.children, depth + 1, node.session.agentType),
    ];
    const truncated: ExecutionTreeRow[] = node.truncated
      ? [
          {
            kind: "truncated",
            key: `truncated:${node.session.id}`,
            depth: depth + 1,
          },
        ]
      : [];
    const toolCalls =
      nested.length > 0
        ? this.toolGroup(node, depth + 1)
        : this.toolCalls(node.toolCalls, depth + 1, node.session.agentType);
    return [
      ...toolCalls,
      ...nested,
      ...interactionRows(node.interactions, depth + 1),
      ...truncated,
    ];
  }

  private toolGroup(
    node: ExecutionSessionNode,
    depth: number,
  ): ExecutionTreeRow[] {
    const key = `tools:${node.session.id}`;
    const children = this.toolCalls(
      node.toolCalls,
      depth + 1,
      node.session.agentType,
    );
    if (children.length === 0) return [];
    const expanded = this.isExpanded(key, children, false);
    const row: ExecutionTreeRow = {
      kind: "toolGroup",
      key,
      depth,
      summary: summarizeCalls(node.toolCalls, 0),
      expandable: true,
      expanded,
    };
    return expanded ? [row, ...children] : [row];
  }

  private sessions(
    nodes: ExecutionSessionNode[],
    depth: number,
    parentAgent: string,
  ) {
    const visible = this.view.issuesOnly
      ? nodes.filter(sessionHasIssues)
      : nodes;
    return visible.flatMap((child) => this.session(child, depth, parentAgent));
  }

  private toolCalls(
    nodes: ExecutionToolCallNode[],
    depth: number,
    agent: string,
  ) {
    const visible = this.view.issuesOnly
      ? nodes.filter(toolCallHasIssues)
      : nodes;
    return visible.flatMap((node) => this.toolCall(node, depth, agent));
  }

  private toolCall(
    node: ExecutionToolCallNode,
    depth: number,
    agent: string,
  ): ExecutionTreeRow[] {
    const row: ExecutionTreeRow = {
      kind: "toolCall",
      key: `tool:${node.toolCall.id}`,
      depth,
      node,
    };
    return node.child
      ? [row, ...this.session(node.child, depth + 1, agent)]
      : [row];
  }

  private run(
    node: ExecutionRunNode,
    {
      depth,
      isLatest,
      agent,
    }: { depth: number; isLatest: boolean; agent: string },
  ): ExecutionTreeRow[] {
    const key = `run:${node.run.id}`;
    const children = [
      ...this.toolCalls(node.toolCalls, depth + 1, agent),
      ...this.sessions(node.delegated, depth + 1, agent),
      ...interactionRows(node.interactions, depth + 1),
    ];
    const expanded = this.isExpanded(
      key,
      children,
      isRunExpandedByDefault(node, isLatest),
    );
    const row: ExecutionTreeRow = {
      kind: "run",
      key,
      depth,
      run: node.run,
      summary: summarizeCalls(node.toolCalls, node.interactions.length),
      expandable: children.length > 0,
      expanded,
    };
    return expanded ? [row, ...children] : [row];
  }
}

function interactionRows(
  interactions: ExecutionInteraction[],
  depth: number,
): ExecutionTreeRow[] {
  return interactions.map((interaction) => ({
    kind: "interaction",
    key: `interaction:${interaction.record.id}`,
    depth,
    interaction,
  }));
}

export function flattenExecutionTree(
  tree: SessionExecutionTree,
  view: ExecutionTreeView = DEFAULT_EXECUTION_TREE_VIEW,
): ExecutionTreeRow[] {
  return new RowBuilder(view).session(tree.root, 0, null);
}

export function toggleExpansion(
  expansion: ReadonlyMap<string, boolean>,
  row: ExpandableExecutionTreeRow,
): ReadonlyMap<string, boolean> {
  return new Map(expansion).set(row.key, !row.expanded);
}

export interface ExecutionTreeSection {
  row: ExecutionTreeRow;
  level: number;
  children: ExecutionTreeSection[];
}

export function groupExecutionTreeSections(
  rows: ExecutionTreeRow[],
): ExecutionTreeSection[] {
  const root: ExecutionTreeSection[] = [];
  const open: { depth: number; section: ExecutionTreeSection }[] = [];
  for (const row of rows) {
    while (open.length > 0 && (open.at(-1)?.depth ?? 0) >= row.depth) {
      open.pop();
    }
    const section: ExecutionTreeSection = {
      row,
      level: open.length,
      children: [],
    };
    const parent = open.at(-1)?.section;
    if (parent) parent.children.push(section);
    else root.push(section);
    if (row.kind === "session") open.push({ depth: row.depth, section });
  }
  return root;
}
