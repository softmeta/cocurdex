import {
  isChatSession,
  type MessageRecord,
  type SessionRecord,
} from "@cocurdex/shared";
import type { AgentRuntimeManager, RuntimePersistence } from "../runtime";
import type { DaemonState } from "../state";
import type { WorkspaceChangeCoordinator } from "../workspace-changes";
import type { WorktreeLifecycle } from "../worktree-lifecycle";
import type { SessionRuntimeMessage } from "./execution-types";

type DispatchHistoryStore = Pick<
  DaemonState,
  "listMessagesBySessionId" | "listQueuedAgentInputs"
>;
type StartContext = Omit<
  Parameters<AgentRuntimeManager["sendSessionMessage"]>[1],
  keyof RuntimePersistence
> & { content: string };

export async function loadDispatchHistory(
  state: DispatchHistoryStore,
  sessionId: string,
  messageId: string,
) {
  const [messages, queuedInputs] = await Promise.all([
    state.listMessagesBySessionId(sessionId),
    state.listQueuedAgentInputs(sessionId),
  ]);
  const queuedMessageIds = new Set(
    queuedInputs.map((input) => input.messageId),
  );
  return messages.filter(
    (message) => message.id === messageId || !queuedMessageIds.has(message.id),
  );
}

export async function dispatchSessionTurn({
  state,
  runtime,
  workspaceChanges,
  worktrees,
  payload,
  userMessage,
  signal,
  persistence,
  prepareStartContext,
}: {
  state: DispatchHistoryStore;
  runtime: Pick<AgentRuntimeManager, "emitAgentEvent" | "sendSessionMessage">;
  workspaceChanges: Pick<WorkspaceChangeCoordinator, "beginTurn" | "failTurn">;
  worktrees: Pick<WorktreeLifecycle, "waitForSetup">;
  payload: SessionRuntimeMessage;
  userMessage: MessageRecord;
  signal: AbortSignal;
  persistence: RuntimePersistence;
  prepareStartContext(
    session: SessionRecord,
    message: MessageRecord,
    history: MessageRecord[],
    persistence: RuntimePersistence,
  ): Promise<StartContext>;
}) {
  const history = await loadDispatchHistory(
    state,
    payload.session.id,
    userMessage.id,
  );
  if (signal.aborted) {
    return null;
  }

  const worktreePath = payload.session.worktreePath?.trim();
  if (worktreePath) {
    await worktrees.waitForSetup({
      sessionId: payload.session.id,
      worktreePath,
      cancelled: new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      }),
      emit: (event) => runtime.emitAgentEvent(event),
    });
    if (signal.aborted) {
      return null;
    }
  }

  if (!isChatSession(payload.session)) {
    await workspaceChanges.beginTurn({
      sessionId: payload.session.id,
      userMessageId: userMessage.id,
      workspaceRootPath: payload.workspaceRootPath,
    });
  }

  if (signal.aborted) {
    await workspaceChanges.failTurn(payload.session.id, "interrupted");
    return null;
  }

  const start = await prepareStartContext(
    payload.session,
    userMessage,
    history,
    persistence,
  );
  if (signal.aborted) {
    return null;
  }
  return runtime.sendSessionMessage(
    {
      ...payload,
      content: start.content,
      attachments: userMessage.attachments,
    },
    {
      ...persistence,
      history: start.history,
      contextHandoff: start.contextHandoff,
      systemSections: start.systemSections,
      runPolicy: start.runPolicy,
      postedMessages: start.postedMessages,
    },
  );
}
