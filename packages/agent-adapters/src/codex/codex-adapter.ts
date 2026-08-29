import type {
  AgentAdapter,
  AgentSession,
  CreateAgentSessionPayload,
  SendAgentMessagePayload,
} from "@cocurdex/agent-core";
import { getAgentDescriptor } from "@cocurdex/agent-core";
import {
  type AgentEvent,
  type AgentMcpServerRuntime,
  type AgentProviderSnapshot,
  type AgentTurnCompletedEvent,
  CODEX_DEFAULT_MODEL_ID,
  type CodexReasoningEffort,
  type CompatibleProviderModel,
  codexBuiltInProviderModel,
  isReasoningEffort,
  type MessageRecord,
} from "@cocurdex/shared";
import { logAdapterDiagnostic } from "../diagnostics";
import {
  logOutgoingPromptForDiagnostics,
  serializeProviderSessionState,
} from "../shared";
import {
  createNativeSessionRecoveryError,
  requiresNativeSessionRecovery,
} from "../shared/session-recovery";
import {
  emitNativeWorkspaceEvidence,
  unifiedDiffToEvidence,
} from "../workspace-changes/native-evidence";
import type {
  CodexAppServerNotification,
  CodexAppServerRequest,
} from "./codex-app-server-client";
import {
  buildInput,
  createSandboxPolicy,
  getItem,
  isRecord,
} from "./codex-app-server-events";
import {
  acquireCodexClient,
  type CodexClientLease,
} from "./codex-app-server-pool";
import {
  CODEX_MCP_STARTUP_STATUS_METHOD,
  mergeCodexMcpServers,
  parseCodexMcpServerStatus,
} from "./codex-mcp";
import {
  canHandleCodexPermissionRequest,
  requestCodexPermission,
} from "./codex-permissions";
import {
  canHandleCodexQuestionRequest,
  requestCodexQuestion,
} from "./codex-questions";
import { parseCodexRateLimits } from "./codex-rate-limits";
import { getCodexReasoningEffortLabel } from "./codex-reasoning-effort";
import { createCodexTurnStream } from "./codex-turn-stream";

const descriptor = getAgentDescriptor("codex");

type CodexCollaborationMode = {
  mode: "default" | "plan";
  settings: {
    model: string;
    reasoning_effort: CodexReasoningEffort | null;
    developer_instructions: null;
  };
};

function createErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown Codex runtime error";
}

// Codex reports its own turn statuses; anything unrecognized stays "unknown"
// rather than claiming the turn ended normally.
function toCodexStopReason(
  status: unknown,
): AgentTurnCompletedEvent["stopReason"] {
  if (status === "completed") {
    return "end_turn";
  }
  if (status === "interrupted") {
    return "cancelled";
  }
  return "unknown";
}

function createCodexCollaborationMode(
  mode: "default" | "plan",
  model?: string | null,
  reasoningEffort?: CodexReasoningEffort | null,
): CodexCollaborationMode {
  const normalizedModel = model?.trim() || CODEX_DEFAULT_MODEL_ID;

  return {
    mode,
    settings: {
      model: normalizedModel,
      reasoning_effort: reasoningEffort ?? null,
      developer_instructions: null,
    },
  };
}

function getCodexModelId(snapshot: AgentProviderSnapshot | null | undefined) {
  return snapshot?.modelId || CODEX_DEFAULT_MODEL_ID;
}

function getCodexServiceTier(
  snapshot: AgentProviderSnapshot | null | undefined,
) {
  const serviceTier = snapshot?.serviceTier?.trim();
  return serviceTier ? serviceTier : undefined;
}

export async function listCodexProviderModels(): Promise<
  CompatibleProviderModel[]
> {
  const lease = acquireCodexClient();

  try {
    const result = await lease.client.listModels({
      includeHidden: false,
      limit: 100,
    });
    const now = new Date().toISOString();
    const models = result.data.map((model) => ({
      provider: codexBuiltInProviderModel.provider,
      model: {
        providerId: codexBuiltInProviderModel.provider.id,
        modelId: model.model || model.id,
        name: model.displayName || model.model || model.id,
        api: "openai-responses" as const,
        enabled: true,
        source: "api" as const,
        contextLimit: null,
        outputLimit: null,
        defaultReasoningEffort: isReasoningEffort(model.defaultReasoningEffort)
          ? model.defaultReasoningEffort
          : null,
        supportedReasoningEfforts: model.supportedReasoningEfforts.flatMap(
          ({ reasoningEffort, description }) =>
            isReasoningEffort(reasoningEffort)
              ? [
                  {
                    reasoningEffort,
                    description,
                    label: getCodexReasoningEffortLabel(reasoningEffort),
                  },
                ]
              : [],
        ),
        serviceTiers: model.serviceTiers ?? [],
        isDefault: model.isDefault,
        createdAt: now,
        updatedAt: now,
      },
    }));

    return models.length > 0 ? models : [codexBuiltInProviderModel];
  } catch (error) {
    logAdapterDiagnostic("info", "[CodexAppServer] model/list fallback", {
      error: createErrorMessage(error),
    });
    return [codexBuiltInProviderModel];
  } finally {
    lease.release();
  }
}

function createCodexSandboxMode(
  payload: CreateAgentSessionPayload,
  permissionMode = payload.session.permissionMode,
) {
  // Mirrors Codex's built-in presets: read-only, workspace-write, and the
  // danger-full-access one its "Full Access" mode selects.
  if (permissionMode === "codex-full-access") {
    return "danger-full-access";
  }

  return permissionMode === "codex-auto" ||
    payload.session.writeMode === "native-write"
    ? "workspace-write"
    : "read-only";
}

function createCodexApprovalPolicy(
  payload: CreateAgentSessionPayload,
  permissionMode = payload.session.permissionMode,
) {
  return permissionMode === "codex-full-access" ? "never" : "on-request";
}

function toPlanStepStatus(
  value: unknown,
): "pending" | "in_progress" | "completed" {
  if (value === "inProgress") {
    return "in_progress";
  }

  if (value === "completed") {
    return "completed";
  }

  return "pending";
}

// turn/plan/updated params: { threadId, turnId, explanation, plan: TurnPlanStep[] }
// where each TurnPlanStep is { step, status: "pending" | "inProgress" | "completed" }.
function parsePlanUpdate(params: unknown) {
  if (!isRecord(params) || !Array.isArray(params.plan)) {
    return null;
  }

  const steps = params.plan.flatMap((step) => {
    if (!isRecord(step) || typeof step.step !== "string" || !step.step) {
      return [];
    }

    return [{ step: step.step, status: toPlanStepStatus(step.status) }];
  });

  return {
    explanation:
      typeof params.explanation === "string" ? params.explanation : null,
    steps,
    updatedAt: new Date().toISOString(),
  };
}

interface CodexAdapterDependencies {
  acquireClient?: typeof acquireCodexClient;
}

export function createCodexAdapter(
  dependencies: CodexAdapterDependencies = {},
): AgentAdapter {
  const acquireClient = dependencies.acquireClient ?? acquireCodexClient;
  return {
    getDescriptor() {
      return descriptor;
    },
    createSession(
      payload: CreateAgentSessionPayload,
      onEvent: (event: AgentEvent) => void,
    ): AgentSession {
      let disposed = false;
      let stopRequested = false;
      let lease: CodexClientLease | null = null;
      let rateLimitsReadStarted = false;
      let threadId: string | null = null;
      let activeTurnId: string | null = null;
      // Start of the in-flight turn, used to report its duration on completion.
      let turnStartedAt: number | null = null;
      let threadReady = false;
      // Model / reasoning effort / service tier are adjustable mid-session, so
      // track the latest snapshot the send path carries instead of the copy
      // captured when this session was created.
      let activeSnapshot = payload.session.providerSnapshot ?? null;
      let activePermissionMode = payload.session.permissionMode;
      const sessionId = payload.session.id;
      const persistedProviderSession = payload.providerSession;
      let desiredThreadTitle = payload.session.title;
      const turnStream = createCodexTurnStream({ sessionId, onEvent });
      let lastUserMessageId: string | null = null;
      // Codex reports MCP startup per server; keep the merged view so the
      // composer menu can show the whole list.
      let mcpServers: AgentMcpServerRuntime[] = [];
      let lastTurnDiff: ReturnType<typeof unifiedDiffToEvidence> | null = null;
      // sendMessage must stay pending until the turn actually ends: the daemon
      // treats its resolution as "turn finished" and only then dispatches the
      // next queued follow-up. Codex reports the end asynchronously through
      // turn/completed, so park the send on this deferred.
      let resolveTurnEnd: (() => void) | null = null;

      function waitForTurnEnd(): Promise<void> {
        return new Promise<void>((resolve) => {
          resolveTurnEnd = resolve;
        });
      }

      function endTurnWait() {
        resolveTurnEnd?.();
        resolveTurnEnd = null;
      }

      async function interruptActiveTurn(): Promise<void> {
        if (!lease || !threadId || !activeTurnId) {
          // Nothing to interrupt is a legitimate state (turn already finished),
          // but a missing turn id while the user asked to stop means the stop
          // silently did nothing — log it so that case is diagnosable.
          if (stopRequested) {
            logAdapterDiagnostic(
              "info",
              "[CodexAdapter] stop had no turn to interrupt",
              {
                hasLease: Boolean(lease),
                sessionId,
                threadId,
                turnId: activeTurnId,
              },
            );
          }
          return;
        }
        const activeLease = lease;
        const activeThreadId = threadId;
        const activeTurn = activeTurnId;
        try {
          await activeLease.client.interruptTurn(activeThreadId, activeTurn);
        } catch (error) {
          // Codex rejects turn/interrupt when the turn id does not match its
          // active turn or the thread is no longer running. Swallowing that
          // silently made a failed stop indistinguishable from a successful
          // one, so record it; a closed transport lands here too and simply
          // means the turn is already over.
          logAdapterDiagnostic("info", "[CodexAdapter] turn interrupt failed", {
            error: error instanceof Error ? error.message : String(error),
            sessionId,
            threadId: activeThreadId,
            turnId: activeTurn,
          });
        }
      }

      function subscribeThread(nextThreadId: string) {
        lease?.subscribeThread(nextThreadId, {
          onNotification: handleNotification,
          onServerRequest: handleServerRequest,
          // Transport-level failure (app-server crashed or spawn failed): no
          // turn/completed is coming, so release the pending send too.
          onError: (error) => {
            endTurnWait();
            emitError(error);
          },
        });
      }

      function emitProviderSessionUpdate(
        nextThreadId: string | null,
        resumable: boolean,
      ) {
        payload.onProviderSessionUpdate?.({
          sessionId,
          providerSessionId: nextThreadId,
          providerStateJson: serializeProviderSessionState(
            nextThreadId
              ? { adapter: "codex", threadId: nextThreadId }
              : { adapter: "codex" },
          ),
          providerVersion: payload.providerSession?.providerVersion ?? null,
          resumable,
          updatedAt: new Date().toISOString(),
        });
      }

      function emitError(error: unknown) {
        if (disposed) {
          return;
        }

        onEvent({
          type: "error",
          sessionId,
          message: createErrorMessage(error),
        });
        onEvent({
          type: "state.changed",
          sessionId,
          status: "error",
        });
      }

      function handleNotification(notification: CodexAppServerNotification) {
        if (disposed) {
          return;
        }

        switch (notification.method) {
          case CODEX_MCP_STARTUP_STATUS_METHOD: {
            const server = parseCodexMcpServerStatus(notification.params);

            if (!server) {
              break;
            }

            mcpServers = mergeCodexMcpServers(mcpServers, server);
            onEvent({
              type: "provider.runtime.updated",
              sessionId,
              receivedAt: new Date().toISOString(),
              runtime: {
                providerId: "codex",
                capabilities: [],
                cwd: payload.workspaceRootPath,
                mcpServers,
                model: activeSnapshot?.modelId ?? "",
                runtimeVersion: "",
                skills: [],
                tools: [],
              },
            });
            break;
          }
          case "turn/started": {
            turnStream.reset();
            // Authoritative turn id: turn/interrupt is rejected unless the id
            // matches Codex's active turn, and the turn/start response is not
            // the only way a turn begins (resume, compact, review, and Codex's
            // own turns only announce themselves here). Without this the stop
            // button silently no-ops whenever the response id is missing.
            const startedTurn = isRecord(notification.params)
              ? notification.params.turn
              : null;
            if (isRecord(startedTurn) && typeof startedTurn.id === "string") {
              activeTurnId = startedTurn.id;
            }
            break;
          }
          case "item/agentMessage/delta":
            turnStream.handleAgentMessageDelta(notification.params);
            break;
          case "item/reasoning/summaryTextDelta":
            turnStream.handleReasoningSummaryDelta(notification.params);
            break;
          case "item/commandExecution/outputDelta":
          case "item/fileChange/outputDelta":
            turnStream.handleToolOutputDelta(notification.params);
            break;
          case "thread/tokenUsage/updated":
            turnStream.handleTokenUsage(notification.params);
            break;
          case "item/started": {
            const item = getItem(notification.params);
            if (item) {
              turnStream.handleItem(item, false);
            }
            break;
          }
          case "item/completed": {
            const item = getItem(notification.params);
            if (item) {
              turnStream.handleItem(item, true);
            }
            break;
          }
          case "turn/diff/updated": {
            const params = isRecord(notification.params)
              ? notification.params
              : null;
            const diff = typeof params?.diff === "string" ? params.diff : null;
            const turnId =
              typeof params?.turnId === "string" ? params.turnId : activeTurnId;
            if (diff != null) {
              lastTurnDiff = unifiedDiffToEvidence(
                "codex-turn-diff",
                "provider-file-tools",
                diff,
                {
                  providerTurnId: turnId,
                  nativeCheckpointRef: turnId,
                },
              );
              emitNativeWorkspaceEvidence(
                onEvent,
                sessionId,
                lastUserMessageId,
                lastTurnDiff,
              );
            }
            break;
          }
          case "turn/plan/updated": {
            const plan = parsePlanUpdate(notification.params);

            if (plan) {
              onEvent({
                type: "plan.updated",
                sessionId,
                plan,
              });
            }
            break;
          }
          case "turn/completed": {
            const finishedTurn = turnStream.finishTurn();
            activeTurnId = null;
            const turn = isRecord(notification.params)
              ? notification.params.turn
              : null;
            const status = isRecord(turn) ? turn.status : null;

            onEvent({
              type: "state.changed",
              sessionId,
              status: status === "failed" ? "error" : "idle",
            });

            // Emitted after `message.completed` so the daemon can attach the
            // stats to a message that already exists. Without it Codex turns
            // render without the duration / usage line every other agent shows.
            if (finishedTurn.messageId && turnStartedAt !== null) {
              onEvent({
                type: "turn.completed",
                sessionId,
                messageId: finishedTurn.messageId,
                durationMs: Date.now() - turnStartedAt,
                ...(finishedTurn.usage ? { usage: finishedTurn.usage } : {}),
                stopReason: toCodexStopReason(status),
                completedAt: new Date().toISOString(),
              });
            }
            turnStartedAt = null;
            endTurnWait();

            if (status === "failed" && isRecord(turn) && isRecord(turn.error)) {
              onEvent({
                type: "error",
                sessionId,
                message:
                  typeof turn.error.message === "string"
                    ? turn.error.message
                    : "Codex turn failed",
              });
            }
            break;
          }
          case "error": {
            // Transient errors the server retries itself should not surface
            // as a terminal session error.
            if (
              isRecord(notification.params) &&
              notification.params.willRetry === true
            ) {
              break;
            }

            const error =
              isRecord(notification.params) &&
              isRecord(notification.params.error)
                ? notification.params.error
                : null;
            const message =
              error && typeof error.message === "string"
                ? error.message
                : "Codex app-server error";
            emitError(new Error(message));
            break;
          }
        }
      }

      function ensureLease() {
        if (!lease) {
          lease = acquireClient();
          lease.onGlobalNotification((notification) => {
            if (notification.method === "account/rateLimits/updated") {
              emitRateLimits(notification.params);
            }
          });
        }
        if (!rateLimitsReadStarted) {
          rateLimitsReadStarted = true;
          void refreshRateLimits(lease);
        }

        return lease;
      }

      function emitRateLimits(value: unknown) {
        const rateLimits = parseCodexRateLimits(value);
        if (!rateLimits || disposed) {
          return;
        }
        onEvent({
          type: "rate_limits.updated",
          sessionId,
          rateLimits,
        });
      }

      async function refreshRateLimits(appServerLease: CodexClientLease) {
        try {
          emitRateLimits(
            await appServerLease.client.request("account/rateLimits/read"),
          );
        } catch (error) {
          logAdapterDiagnostic(
            "debug",
            "[CodexAdapter] rate limits unavailable",
            {
              error: error instanceof Error ? error.message : String(error),
              sessionId,
            },
          );
        }
      }

      async function handleServerRequest(request: CodexAppServerRequest) {
        if (canHandleCodexPermissionRequest(request.method)) {
          return requestCodexPermission(payload, request);
        }

        if (canHandleCodexQuestionRequest(request.method)) {
          return requestCodexQuestion(payload, request);
        }

        throw new Error(`Unsupported app-server request: ${request.method}`);
      }

      async function startFreshThread(appServerLease: CodexClientLease) {
        const serviceTier = getCodexServiceTier(activeSnapshot);
        const model = getCodexModelId(activeSnapshot);
        const result = await appServerLease.client.startThread({
          model,
          cwd: payload.workspaceRootPath,
          sandbox: createCodexSandboxMode(payload, activePermissionMode),
          experimentalRawEvents: false,
          ...(serviceTier ? { serviceTier } : {}),
        });
        threadId = result.thread.id;
        subscribeThread(threadId);
        threadReady = true;
        await syncThreadTitle(appServerLease, result.thread.name);
        emitProviderSessionUpdate(threadId, true);
        logAdapterDiagnostic("info", "[CodexAdapter] thread opened", {
          providerSessionId: threadId,
          sessionAction: "new",
          sessionId,
          workspaceRootPath: payload.workspaceRootPath,
        });
      }

      async function resumeThread(appServerLease: CodexClientLease) {
        if (!threadId) {
          return false;
        }

        const serviceTier = getCodexServiceTier(activeSnapshot);
        const model = getCodexModelId(activeSnapshot);
        subscribeThread(threadId);
        const result = await appServerLease.client.resumeThread({
          threadId,
          model,
          cwd: payload.workspaceRootPath,
          sandbox: createCodexSandboxMode(payload, activePermissionMode),
          excludeTurns: true,
          ...(serviceTier ? { serviceTier } : {}),
        });
        threadReady = true;
        await syncThreadTitle(appServerLease, result.thread.name);
        emitProviderSessionUpdate(threadId, true);
        logAdapterDiagnostic("info", "[CodexAdapter] thread opened", {
          providerSessionId: threadId,
          sessionAction: "resume",
          sessionId,
          workspaceRootPath: payload.workspaceRootPath,
        });
        return true;
      }

      async function syncThreadTitle(
        appServerLease: CodexClientLease,
        currentThreadTitle?: string | null,
      ) {
        if (!threadId || currentThreadTitle === desiredThreadTitle) {
          return;
        }
        await appServerLease.client.setThreadName(threadId, desiredThreadTitle);
      }

      return {
        async setTitle(title: string) {
          desiredThreadTitle = title;
          if (!threadReady || !threadId || !lease) {
            return;
          }
          await syncThreadTitle(lease);
        },
        async sendMessage(
          messagePayload: SendAgentMessagePayload,
        ): Promise<MessageRecord> {
          const userMessage: MessageRecord = {
            id: messagePayload.messageId ?? crypto.randomUUID(),
            sessionId,
            role: "user",
            content: messagePayload.content.trim(),
            attachments: messagePayload.attachments ?? [],
            createdAt: new Date().toISOString(),
          };
          lastUserMessageId = userMessage.id;
          lastTurnDiff = null;

          activeSnapshot =
            messagePayload.providerSnapshot ?? activeSnapshot ?? null;
          if (messagePayload.permissionMode !== undefined) {
            activePermissionMode = messagePayload.permissionMode ?? undefined;
          }
          stopRequested = false;
          // Steering feeds an already running turn, so it must not restart the
          // clock; every other delivery opens a new turn.
          if (messagePayload.delivery !== "steer-active-run") {
            turnStartedAt = Date.now();
          }
          onEvent({
            type: "state.changed",
            sessionId,
            status: "running",
          });

          try {
            const appServerLease = ensureLease();
            threadId =
              threadId ??
              payload.providerSession?.providerSessionId ??
              persistedProviderSession?.providerSessionId ??
              null;
            const input = buildInput(
              messagePayload.content,
              messagePayload.attachments ?? [],
            );

            if (messagePayload.delivery === "steer-active-run") {
              if (!threadReady || !threadId || !activeTurnId) {
                throw new Error("Codex has no active turn to steer");
              }
              logOutgoingPromptForDiagnostics({
                agentId: "codex",
                attachments: messagePayload.attachments ?? [],
                history: messagePayload.history,
                prompt: messagePayload.content,
                sessionId,
              });
              await appServerLease.client.steerTurn({
                threadId,
                expectedTurnId: activeTurnId,
                clientUserMessageId: userMessage.id,
                input,
              });
              return userMessage;
            }

            if (!threadReady) {
              const shouldResume = payload.providerSession?.resumable ?? false;

              if (shouldResume && threadId) {
                try {
                  await resumeThread(appServerLease);
                } catch (error) {
                  logAdapterDiagnostic(
                    "info",
                    "[CodexAdapter] thread resume failed",
                    {
                      error:
                        error instanceof Error ? error.message : String(error),
                      providerSessionId: threadId,
                      sessionId,
                      workspaceRootPath: payload.workspaceRootPath,
                    },
                  );
                  appServerLease.unsubscribeThread(threadId);
                  emitProviderSessionUpdate(threadId, false);
                  throw createNativeSessionRecoveryError("Codex");
                }
              } else {
                if (requiresNativeSessionRecovery(messagePayload.history)) {
                  logAdapterDiagnostic(
                    "info",
                    "[CodexAdapter] thread recovery blocked",
                    {
                      historyMessageCount: messagePayload.history.length,
                      providerSessionId: threadId,
                      resumable: shouldResume,
                      sessionId,
                      workspaceRootPath: payload.workspaceRootPath,
                    },
                  );
                  throw createNativeSessionRecoveryError("Codex");
                }
                await startFreshThread(appServerLease);
              }
            }

            const serviceTier = getCodexServiceTier(activeSnapshot);
            const promptText =
              input.find(
                (part): part is { text: string; type: "text" } =>
                  part.type === "text",
              )?.text ?? "";
            logOutgoingPromptForDiagnostics({
              agentId: "codex",
              attachments: messagePayload.attachments ?? [],
              history: messagePayload.history,
              prompt: promptText,
              sessionId,
            });
            const model = getCodexModelId(activeSnapshot);
            const snapshotReasoningEffort = activeSnapshot?.reasoningEffort;
            const reasoningEffort =
              snapshotReasoningEffort &&
              isReasoningEffort(snapshotReasoningEffort)
                ? snapshotReasoningEffort
                : null;
            // Registered before turn/start so a turn that completes while the
            // response is still in flight cannot resolve into the void.
            const turnEnded = waitForTurnEnd();
            const turn = await appServerLease.client.startTurn({
              threadId,
              input,
              cwd: payload.workspaceRootPath,
              approvalPolicy: createCodexApprovalPolicy(
                payload,
                activePermissionMode,
              ),
              // Plan mode only exists as the experimental collaborationMode
              // param; the default mode uses the stable model/effort fields
              // to keep the experimental surface minimal.
              ...(payload.session.collaborationMode === "plan"
                ? {
                    collaborationMode: createCodexCollaborationMode(
                      "plan",
                      model,
                      reasoningEffort,
                    ),
                  }
                : {
                    model,
                    ...(reasoningEffort ? { effort: reasoningEffort } : {}),
                  }),
              ...(serviceTier ? { serviceTier } : {}),
              sandboxPolicy: createSandboxPolicy(payload, activePermissionMode),
            });
            activeTurnId = turn.turn.id;
            if (disposed || stopRequested) {
              void interruptActiveTurn();
            }
            await turnEnded;
          } catch (error) {
            endTurnWait();
            emitError(error);
          }

          return userMessage;
        },
        // Interrupt only; keep consuming notifications so the partial
        // assistant message and the terminal turn/completed (status
        // "interrupted") still land.
        getWorkspaceChangeCapabilities() {
          return {
            turnDiff: "full" as const,
            fileRewind: "none" as const,
            coverage: "provider-file-tools" as const,
            conversationRevert: false,
          };
        },
        async collectNativeWorkspaceChanges() {
          return lastTurnDiff;
        },
        async stop() {
          stopRequested = true;
          await interruptActiveTurn();
        },
        dispose() {
          disposed = true;
          endTurnWait();

          if (lease && threadId) {
            lease.unsubscribeThread(threadId);
            void lease.client.unsubscribeThread(threadId).catch(() => {});
          }

          lease?.release();
          lease = null;
        },
      };
    },
  };
}
