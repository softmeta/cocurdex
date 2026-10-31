import type {
  AgentSessionPlan,
  AgentToolCallRecord,
  RunRecord,
  SessionExecutionTree,
  SessionInteractionSnapshot,
  SessionRecord,
} from "@cocurdex/shared";
import { buildExecutionTree } from "./build-execution-tree";

export const DEFAULT_EXECUTION_TREE_DEPTH = 4;

export interface ExecutionTreeDeps {
  listSessions(): Promise<SessionRecord[]>;
  listRuns(sessionId: string): RunRecord[];
  listToolCalls(sessionId: string): Promise<AgentToolCallRecord[]>;
  getInteractions(): SessionInteractionSnapshot;
  getPlan(sessionId: string): AgentSessionPlan | null;
}

function collectSessionIds(
  rootSessionId: string,
  sessions: SessionRecord[],
  maxDepth: number,
) {
  const ids = new Set([rootSessionId]);
  let frontier = [rootSessionId];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
    const parents = new Set(frontier);
    frontier = sessions
      .filter(
        (session) =>
          session.parentSessionId &&
          parents.has(session.parentSessionId) &&
          !ids.has(session.id),
      )
      .map((session) => session.id);
    for (const id of frontier) ids.add(id);
  }
  return [...ids];
}

export async function loadExecutionTree(
  deps: ExecutionTreeDeps,
  rootSessionId: string,
  maxDepth = DEFAULT_EXECUTION_TREE_DEPTH,
): Promise<SessionExecutionTree | null> {
  const sessions = await deps.listSessions();
  if (!sessions.some((session) => session.id === rootSessionId)) return null;

  const sessionIds = collectSessionIds(rootSessionId, sessions, maxDepth);
  const toolCalls = await Promise.all(
    sessionIds.map(async (id) => [id, await deps.listToolCalls(id)] as const),
  );
  return buildExecutionTree(
    rootSessionId,
    {
      sessions,
      runs: Object.fromEntries(sessionIds.map((id) => [id, deps.listRuns(id)])),
      toolCalls: Object.fromEntries(toolCalls),
      interactions: deps.getInteractions(),
      plans: Object.fromEntries(sessionIds.map((id) => [id, deps.getPlan(id)])),
    },
    maxDepth,
  );
}
