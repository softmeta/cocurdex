import type { AgentId, SessionRecord } from "@cocurdex/shared";
import {
  groupChildren,
  rootSessionId,
  subtreeActivityAt,
} from "../session-tree";

export const SESSION_GROUPINGS = [
  "workspace",
  "status",
  "updated",
  "agent",
] as const;
export type SessionGrouping = (typeof SESSION_GROUPINGS)[number];

export const SESSION_ORDERINGS = ["activity", "created"] as const;
export type SessionOrdering = (typeof SESSION_ORDERINGS)[number];

export const SESSION_STATUS_BUCKETS = [
  "attention",
  "error",
  "running",
  "unread",
  "idle",
] as const;
export type SessionStatusBucket = (typeof SESSION_STATUS_BUCKETS)[number];

export const SESSION_ENVIRONMENTS = ["local", "worktree"] as const;
export type SessionEnvironment = (typeof SESSION_ENVIRONMENTS)[number];

export const SESSION_SOURCES = ["created", "imported", "issue"] as const;
export type SessionSource = (typeof SESSION_SOURCES)[number];

export const SESSION_UPDATED_BUCKETS = [
  "today",
  "yesterday",
  "week",
  "older",
] as const;
export type SessionUpdatedBucket = (typeof SESSION_UPDATED_BUCKETS)[number];

export const SESSION_ROOT_LIMITS = ["8", "20", "all"] as const;
export type SessionRootLimit = (typeof SESSION_ROOT_LIMITS)[number];

export interface SessionListView {
  grouping: SessionGrouping;
  ordering: SessionOrdering;
  rootLimit: SessionRootLimit;
  showTimestamps: boolean;
  statuses: SessionStatusBucket[];
  agents: AgentId[];
  environments: SessionEnvironment[];
  sources: SessionSource[];
}

export const DEFAULT_SESSION_LIST_VIEW: SessionListView = {
  grouping: "workspace",
  ordering: "activity",
  rootLimit: "8",
  showTimestamps: true,
  statuses: [],
  agents: [],
  environments: [],
  sources: [],
};

export interface SessionListFacts {
  attentionIds: ReadonlySet<string>;
  issueLinkedIds: ReadonlySet<string>;
  unreadIds: ReadonlySet<string>;
}

export interface SessionGroup {
  key: string;
  value: string;
  rootCount: number;
  sessions: SessionRecord[];
}

function pickOne<T extends string>(
  options: readonly T[],
  value: unknown,
  fallback: T,
): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function pickMany<T extends string>(
  value: unknown,
  isOption: (item: unknown) => item is T,
): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter(isOption))];
}

function isStoredAgentId(item: unknown): item is AgentId {
  return typeof item === "string" && item.length > 0;
}

function isOneOf<T extends string>(options: readonly T[]) {
  return (item: unknown): item is T => options.includes(item as T);
}

export function normalizeSessionListView(value: unknown): SessionListView {
  const input =
    value && typeof value === "object"
      ? (value as Partial<Record<keyof SessionListView, unknown>>)
      : {};
  const defaults = DEFAULT_SESSION_LIST_VIEW;
  return {
    grouping: pickOne(SESSION_GROUPINGS, input.grouping, defaults.grouping),
    ordering: pickOne(SESSION_ORDERINGS, input.ordering, defaults.ordering),
    rootLimit: pickOne(
      SESSION_ROOT_LIMITS,
      input.rootLimit,
      defaults.rootLimit,
    ),
    showTimestamps:
      typeof input.showTimestamps === "boolean"
        ? input.showTimestamps
        : defaults.showTimestamps,
    statuses: pickMany(input.statuses, isOneOf(SESSION_STATUS_BUCKETS)),
    agents: pickMany(input.agents, isStoredAgentId),
    environments: pickMany(input.environments, isOneOf(SESSION_ENVIRONMENTS)),
    sources: pickMany(input.sources, isOneOf(SESSION_SOURCES)),
  };
}

export function countActiveSessionFilters(view: SessionListView) {
  return (
    view.statuses.length +
    view.agents.length +
    view.environments.length +
    view.sources.length
  );
}

export function isCustomizedSessionListView(view: SessionListView) {
  return (
    countActiveSessionFilters(view) > 0 ||
    view.grouping !== DEFAULT_SESSION_LIST_VIEW.grouping ||
    view.ordering !== DEFAULT_SESSION_LIST_VIEW.ordering
  );
}

export function resolveRootLimit(rootLimit: SessionRootLimit) {
  return rootLimit === "all" ? Number.POSITIVE_INFINITY : Number(rootLimit);
}

function groupByRoot(sessions: readonly SessionRecord[]) {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const trees = new Map<string, SessionRecord[]>();
  for (const session of sessions) {
    const rootId = rootSessionId(session.id, byId);
    const tree = trees.get(rootId) ?? [];
    tree.push(session);
    trees.set(rootId, tree);
  }
  return { byId, trees };
}

export function sessionStatusBucket(
  tree: readonly SessionRecord[],
  root: SessionRecord,
  facts: SessionListFacts,
): SessionStatusBucket {
  if (tree.some((session) => facts.attentionIds.has(session.id))) {
    return "attention";
  }
  if (root.status === "error") {
    return "error";
  }
  if (tree.some((session) => session.status === "running")) {
    return "running";
  }
  if (facts.unreadIds.has(root.id)) {
    return "unread";
  }
  return "idle";
}

export function sessionEnvironment(root: SessionRecord): SessionEnvironment {
  return root.worktreePath ? "worktree" : "local";
}

export function sessionSource(
  root: SessionRecord,
  facts: SessionListFacts,
): SessionSource {
  if (facts.issueLinkedIds.has(root.id)) {
    return "issue";
  }
  return root.importedProviderSessionId ? "imported" : "created";
}

function matchesFilter<T>(selected: readonly T[], value: T) {
  return selected.length === 0 || selected.includes(value);
}

export function filterSessionsByView(
  sessions: readonly SessionRecord[],
  view: SessionListView,
  facts: SessionListFacts,
): SessionRecord[] {
  if (countActiveSessionFilters(view) === 0) {
    return [...sessions];
  }
  const { byId, trees } = groupByRoot(sessions);
  const kept: SessionRecord[] = [];
  for (const [rootId, tree] of trees) {
    const root = byId.get(rootId);
    if (
      root &&
      matchesFilter(view.statuses, sessionStatusBucket(tree, root, facts)) &&
      matchesFilter(view.agents, root.agentType) &&
      matchesFilter(view.environments, sessionEnvironment(root)) &&
      matchesFilter(view.sources, sessionSource(root, facts))
    ) {
      kept.push(...tree);
    }
  }
  return kept;
}

function startOfDay(date: Date, offsetDays = 0) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - offsetDays,
  ).getTime();
}

export function sessionUpdatedBucket(
  activityAt: string,
  now: Date,
): SessionUpdatedBucket {
  const time = Date.parse(activityAt);
  if (time >= startOfDay(now)) {
    return "today";
  }
  if (time >= startOfDay(now, 1)) {
    return "yesterday";
  }
  if (time >= startOfDay(now, 6)) {
    return "week";
  }
  return "older";
}

function groupValue(
  grouping: Exclude<SessionGrouping, "workspace">,
  tree: readonly SessionRecord[],
  root: SessionRecord,
  context: {
    childrenByParent: ReturnType<typeof groupChildren>;
    facts: SessionListFacts;
    now: Date;
  },
): string {
  if (grouping === "status") {
    return sessionStatusBucket(tree, root, context.facts);
  }
  if (grouping === "updated") {
    return sessionUpdatedBucket(
      subtreeActivityAt(root, context.childrenByParent),
      context.now,
    );
  }
  return root.agentType;
}

function groupOrder(grouping: Exclude<SessionGrouping, "workspace">) {
  if (grouping === "status") {
    return SESSION_STATUS_BUCKETS;
  }
  if (grouping === "updated") {
    return SESSION_UPDATED_BUCKETS;
  }
  return null;
}

export function groupSessionsByView(
  sessions: readonly SessionRecord[],
  grouping: Exclude<SessionGrouping, "workspace">,
  facts: SessionListFacts,
  now: Date,
): SessionGroup[] {
  const { byId, trees } = groupByRoot(sessions);
  const context = { childrenByParent: groupChildren(sessions), facts, now };
  const groups = new Map<string, SessionRecord[][]>();
  for (const [rootId, tree] of trees) {
    const root = byId.get(rootId);
    if (!root) {
      continue;
    }
    const value = groupValue(grouping, tree, root, context);
    groups.set(value, [...(groups.get(value) ?? []), tree]);
  }
  const order = groupOrder(grouping);
  const values = order
    ? order.filter((value) => groups.has(value))
    : [...groups.keys()].sort((left, right) => left.localeCompare(right));
  return values.map((value) => {
    const groupTrees = groups.get(value) ?? [];
    return {
      key: `${grouping}:${value}`,
      value,
      rootCount: groupTrees.length,
      sessions: groupTrees.flat(),
    };
  });
}
