import type {
  AgentId,
  AgentProviderSnapshot,
  MessageRecord,
  SessionRecord,
  WorkflowAttemptRecord,
  WorkflowAttemptRuntimeIdentity,
} from "@cocurdex/shared";
import { getFallbackAgentPermissionModes } from "@cocurdex/shared";
import type { AgentRuntimeManager, RuntimePersistence } from "../runtime";
import type { DaemonState } from "../state";
import type {
  WorkflowAgentTurnInput,
  WorkflowAgentTurnResult,
  WorkflowAgentTurnRunner,
} from "./runtime-workflow-action-executor";

const agentNames: Record<AgentId, string> = {
  "claude-agent": "Claude Agent",
  codex: "Codex",
  "grok-build": "Grok Build",
  opencode: "OpenCode",
  pi: "Pi",
};

function permissionMode(attempt: WorkflowAttemptRecord) {
  const risk =
    attempt.executorBinding.permissionProfile === "workspace_write"
      ? "elevated"
      : "normal";
  return getFallbackAgentPermissionModes(attempt.executorBinding.agentId).find(
    (mode) => mode.risk === risk,
  )?.id;
}

function modelSnapshot(
  attempt: WorkflowAttemptRecord,
): AgentProviderSnapshot | null {
  if (attempt.executorBinding.providerSnapshot) {
    return attempt.executorBinding.providerSnapshot;
  }
  const model = attempt.executorBinding.model;
  if (!model) return null;
  if (attempt.executorBinding.agentId === "pi") {
    throw new Error(
      "A Pi workflow binding with an explicit model requires a provider snapshot.",
    );
  }
  const apiByAgent: Partial<Record<AgentId, AgentProviderSnapshot["api"]>> = {
    "claude-agent": "anthropic-messages",
    codex: "openai-responses",
    "grok-build": "openai-responses",
    opencode: "openai-completions",
  };
  return {
    providerId: attempt.executorBinding.agentId,
    providerName: agentNames[attempt.executorBinding.agentId],
    modelId: model,
    modelName: model,
    api: apiByAgent[attempt.executorBinding.agentId] ?? "openai-responses",
    baseUrl: "",
  };
}

function createSession(
  attempt: WorkflowAttemptRecord,
  sessionId: string,
  workspaceId: string,
  stepId: string,
  now: string,
): SessionRecord {
  const writeMode =
    attempt.executorBinding.permissionProfile === "read_only"
      ? "read-only"
      : "native-write";
  return {
    id: sessionId,
    workspaceId,
    title: `Workflow: ${stepId}`,
    agentType: attempt.executorBinding.agentId,
    sessionKind: "subagent",
    status: "running",
    writeMode,
    collaborationMode: "default",
    permissionMode: permissionMode(attempt),
    providerSnapshot: modelSnapshot(attempt),
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    archivedAt: null,
  };
}

export class DaemonWorkflowAgentTurnRunner implements WorkflowAgentTurnRunner {
  constructor(
    private readonly state: DaemonState,
    private readonly runtime: AgentRuntimeManager,
  ) {}

  async run(input: WorkflowAgentTurnInput): Promise<WorkflowAgentTurnResult> {
    input.signal.throwIfAborted();
    const sessionId = input.attempt.sessionId ?? `workflow-${input.attempt.id}`;
    const existingSession = await this.state.getSession(sessionId);
    const now = new Date().toISOString();
    const session = existingSession
      ? { ...existingSession, status: "running" as const, updatedAt: now }
      : createSession(
          input.attempt,
          sessionId,
          input.workspaceId,
          input.stepId,
          now,
        );
    await this.state.saveSession(session);

    const existingOperationId =
      input.attempt.runtimeIdentity.providerOperationId;
    if (existingOperationId) {
      const completedMessage =
        await this.state.getMessageById(existingOperationId);
      if (completedMessage?.role === "assistant") {
        return {
          content: completedMessage.content,
          providerOperationId: completedMessage.id,
        };
      }
      throw new Error(
        `Provider operation '${existingOperationId}' cannot be reconciled from persisted session output.`,
      );
    }

    const providerSession = await this.state.getProviderSession(sessionId);
    let latestIdentity: WorkflowAttemptRuntimeIdentity = {
      ...input.attempt.runtimeIdentity,
      providerSessionId: providerSession?.providerSessionId ?? null,
    };
    await input.checkpointAttempt(latestIdentity, sessionId);

    let checkpointQueue = Promise.resolve();
    const persistence: RuntimePersistence = {
      providerSession,
      onProviderSessionUpdate: (nextProviderSession) => {
        checkpointQueue = checkpointQueue.then(async () => {
          if (nextProviderSession) {
            await this.state.saveProviderSession(
              nextProviderSession.sessionId,
              nextProviderSession.providerSessionId,
              JSON.parse(nextProviderSession.providerStateJson) as Record<
                string,
                unknown
              >,
              nextProviderSession.resumable,
              nextProviderSession.providerVersion,
            );
          } else {
            await this.state.clearProviderSession(sessionId);
          }
          latestIdentity = {
            ...latestIdentity,
            providerSessionId: nextProviderSession?.providerSessionId ?? null,
          };
          await input.checkpointAttempt(latestIdentity, sessionId);
        });
      },
    };
    const userMessage: MessageRecord = {
      id: `${input.attempt.id}:prompt`,
      sessionId,
      role: "user",
      content: input.prompt,
      attachments: [],
      createdAt: now,
    };
    await this.state.saveUserMessage(userMessage);
    const history = await this.state.listMessagesBySessionId(sessionId);

    const cancel = () => {
      void this.runtime.cancelSessionTurn(sessionId);
    };
    input.signal.addEventListener("abort", cancel, { once: true });
    try {
      const message = await this.runtime.sendSessionMessage(
        {
          session,
          workspaceRootPath: input.workspaceRootPath,
          messageId: userMessage.id,
          createdAt: userMessage.createdAt,
          content: userMessage.content,
          attachments: [],
          delivery: "start-new-run",
        },
        { ...persistence, history, providerConfig: null },
      );
      await checkpointQueue;
      return { content: message.content, providerOperationId: message.id };
    } finally {
      input.signal.removeEventListener("abort", cancel);
    }
  }
}
