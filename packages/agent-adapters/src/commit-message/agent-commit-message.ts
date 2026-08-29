import type { AgentSession } from "@cocurdex/agent-core";
import type {
  AgentEvent,
  AgentId,
  AgentProviderSnapshot,
  AgentRuntimeProviderConfig,
  SessionRecord,
} from "@cocurdex/shared";
import { createAgentAdapter } from "../agent-adapter-factory";
import {
  buildAgentCommitMessagePrompt,
  normalizeGeneratedCommitMessage,
} from "../pi-sdk/pi-commit-message";

const READ_ONLY_PERMISSION_KINDS = new Set([
  "glob",
  "grep",
  "list",
  "read",
  "search",
]);

export function resolveCommitMessagePermission(kind: string) {
  return READ_ONLY_PERMISSION_KINDS.has(kind.trim().toLowerCase())
    ? ("allow_once" as const)
    : ("reject_always" as const);
}

function createAbortError() {
  const error = new Error("Commit message generation aborted");
  error.name = "AbortError";
  return error;
}

function createEphemeralSession(
  agentId: AgentId,
  providerSnapshot: AgentProviderSnapshot,
): SessionRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    workspaceId: "commit-message-generation",
    title: "Commit message generation",
    agentType: agentId,
    status: "idle",
    writeMode: "read-only",
    collaborationMode: "default",
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    archivedAt: null,
    providerSnapshot,
  };
}

async function runUntilAborted<T>(
  operation: Promise<T>,
  signal: AbortSignal | undefined,
  runtime: AgentSession,
) {
  if (!signal) {
    return operation;
  }
  if (signal.aborted) {
    throw createAbortError();
  }

  let rejectAbort: (error: Error) => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => {
    void Promise.resolve(runtime.stop()).catch(() => undefined);
    rejectAbort(createAbortError());
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export async function generateAgentCommitMessage(params: {
  agentId: AgentId;
  providerSnapshot: AgentProviderSnapshot;
  providerConfig: AgentRuntimeProviderConfig;
  workspaceRootPath: string;
  changeSummary: string;
  signal?: AbortSignal;
  onDiagnostic?: (
    event: string,
    details: Record<string, boolean | number | string | null>,
  ) => void;
}): Promise<string | null> {
  const adapter = createAgentAdapter(params.agentId);
  const session = createEphemeralSession(
    params.agentId,
    params.providerSnapshot,
  );
  let completedResponse = "";
  let runtimeError: Error | null = null;
  const eventCounts = new Map<string, number>();
  const report = (
    event: string,
    details: Record<string, boolean | number | string | null> = {},
  ) => {
    params.onDiagnostic?.(event, details);
  };
  let resolveResponse: () => void = () => undefined;
  const responseAvailable = new Promise<void>((resolve) => {
    resolveResponse = resolve;
  });
  const runtime = adapter.createSession(
    {
      session,
      workspaceRootPath: params.workspaceRootPath,
      providerConfig: params.providerConfig,
      requestPermission: async (request) =>
        resolveCommitMessagePermission(request.kind),
      requestQuestion: async () => null,
      requestPlanApproval: async () => ({ outcome: "abandoned" }),
    },
    (event: AgentEvent) => {
      eventCounts.set(event.type, (eventCounts.get(event.type) ?? 0) + 1);
      if (
        event.type === "message.completed" &&
        event.message.role === "assistant" &&
        event.message.kind !== "reasoning"
      ) {
        completedResponse = event.message.content;
        report("assistantCompleted", {
          contentLength: event.message.content.length,
          kind: event.message.kind ?? null,
        });
        resolveResponse();
        return;
      }
      if (event.type === "turn.completed") {
        report("turnCompleted", {
          messageId: event.messageId,
          stopReason: event.stopReason ?? null,
        });
        resolveResponse();
        return;
      }
      if (event.type === "error") {
        runtimeError = new Error(event.message);
        report("runtimeError", { message: event.message });
        resolveResponse();
      }
    },
  );

  try {
    const startedAt = Date.now();
    report("sendStarted", { agentId: params.agentId });
    const message = await runUntilAborted(
      runtime.sendMessage({
        content: buildAgentCommitMessagePrompt(params.changeSummary),
        history: [],
        collaborationMode: "default",
        providerSnapshot: params.providerSnapshot,
        providerConfig: params.providerConfig,
      }),
      params.signal,
      runtime,
    );
    report("sendResolved", {
      completedResponseLength: completedResponse.length,
      durationMs: Date.now() - startedAt,
      eventCounts: JSON.stringify(Object.fromEntries(eventCounts)),
      returnedContentLength: message.content.length,
      returnedRole: message.role,
    });
    let response =
      completedResponse ||
      (message.role === "assistant" ? message.content : "");
    if (!response) {
      // Some adapters, notably Codex app-server, return the accepted user
      // message as soon as the turn starts. The assistant response arrives on
      // the event stream later, so keep the ephemeral runtime alive for it.
      report("waitingForResponse", {
        eventCounts: JSON.stringify(Object.fromEntries(eventCounts)),
      });
      await runUntilAborted(responseAvailable, params.signal, runtime);
      if (runtimeError) {
        throw runtimeError;
      }
      response = completedResponse;
    }
    const normalized = normalizeGeneratedCommitMessage(response);
    report("responseCollected", {
      eventCounts: JSON.stringify(Object.fromEntries(eventCounts)),
      normalizedLength: normalized?.length ?? 0,
      responseLength: response.length,
    });
    return normalized;
  } finally {
    report("runtimeDisposing", {
      eventCounts: JSON.stringify(Object.fromEntries(eventCounts)),
    });
    await runtime.dispose();
  }
}
