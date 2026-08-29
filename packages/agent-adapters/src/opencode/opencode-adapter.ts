import type {
  AgentAdapter,
  AgentSession,
  CreateAgentSessionPayload,
  SendAgentMessagePayload,
} from "@cocurdex/agent-core";
import { getAgentDescriptor } from "@cocurdex/agent-core";
import type { AgentEvent, MessageRecord } from "@cocurdex/shared";
import type { Event as OpenCodeEvent, OpencodeClient } from "@opencode-ai/sdk";
import type { OpencodeClient as OpenCodeV2Client } from "@opencode-ai/sdk/v2";
import {
  logOutgoingPromptForDiagnostics,
  serializeProviderSessionState,
} from "../shared";
import { createNativeSessionTitleTracker } from "../shared/native-session-title";
import {
  createNativeSessionRecoveryError,
  requiresNativeSessionRecovery,
} from "../shared/session-recovery";
import {
  emitNativeWorkspaceEvidence,
  openCodeDiffsToEvidence,
} from "../workspace-changes/native-evidence";
import { OpenCodeEventHandler } from "./opencode-event-handler";
import { buildPrompt, buildPromptParts } from "./opencode-events";
import { createOpenCodeMessageId } from "./opencode-message-id";
import { assertOpenCodeModelAvailable } from "./opencode-models";
import {
  createOpenCodePermissionRequest,
  mapOpenCodeDecision,
} from "./opencode-permissions";
import { resolveOpenCodeQuestion } from "./opencode-questions";
import {
  acquireOpenCodeRuntime,
  expectOpenCodeData,
  expectOpenCodeSuccess,
  formatOpenCodeError,
  formatOpenCodeUserFacingError,
  isOpenCodeNotFound,
  logOpenCode,
  type OpenCodeRuntime,
  releaseOpenCodeRuntime,
} from "./opencode-runtime";
import { getOpenCodePromptSelection } from "./opencode-selection";
import { OpenCodeTurnCompletion } from "./opencode-turn-completion";

const descriptor = getAgentDescriptor("opencode");

const OPENCODE_PLAN_SYSTEM = [
  "You are in Plan Mode inside Cocurdex.",
  "Plan the work before making changes.",
  "Do not edit files, run write commands, or change external systems.",
  "Ask concise clarification questions when a safe implementation plan depends on missing information.",
  "Return a concrete plan with ordered steps and call out risks or checks.",
].join("\n");

const OPENCODE_PLAN_TOOLS: Record<string, boolean> = {
  bash: false,
  edit: false,
  patch: false,
  todowrite: true,
  write: false,
};

// OpenCode session IDs currently owned by a live adapter instance in this
// process. Session adoption must never steal a session that another
// concurrent Cocurdex session (or its subagent tree) already owns.
const claimedOpenCodeSessionIds = new Set<string>();
const OPENCODE_PROVIDER_VERSION = "opencode";
const OPENCODE_FIRST_EVENT_TIMEOUT_MS = 10_000;

export interface DeleteOpenCodeSessionPayload {
  providerSessionId: string;
  workspaceRootPath: string;
}

export async function deleteOpenCodeSession(
  payload: DeleteOpenCodeSessionPayload,
) {
  const runtime = await acquireOpenCodeRuntime();

  try {
    const result = await runtime.client.session.delete({
      path: { id: payload.providerSessionId },
      query: { directory: payload.workspaceRootPath },
    });
    if (result.error && result.response.status !== 404) {
      throw new Error(
        `OpenCode delete session failed: ${formatOpenCodeError(result.error)}`,
      );
    }
  } finally {
    releaseOpenCodeRuntime(runtime);
  }
}

export function createOpencodeAdapter(): AgentAdapter {
  return {
    getDescriptor() {
      return descriptor;
    },
    createSession(
      payload: CreateAgentSessionPayload,
      onEvent: (event: AgentEvent) => void,
    ): AgentSession {
      let disposed = false;
      let client: OpencodeClient | null = null;
      let clientV2: OpenCodeV2Client | null = null;
      let runtime: OpenCodeRuntime | null = null;
      let initializationFinished = false;
      let initializationError: unknown = null;
      let activeSessionId: string | null = null;
      let eventAbortController: AbortController | null = null;
      let promptEventSessionAdoptionEnabled = false;
      let acceptedOpenCodeEventForPrompt = false;
      let activePromptRequestId: string | null = null;
      let promptWatchdog: ReturnType<typeof setTimeout> | null = null;
      let activeTurnPromise: Promise<void> | null = null;
      const turnCompletion = new OpenCodeTurnCompletion();
      let activePermissionMode = payload.session.permissionMode;
      let lastUserMessageId: string | null = null;
      let lastProviderUserMessageId: string | null = null;
      let lastNativeDiff: ReturnType<typeof openCodeDiffsToEvidence> | null =
        null;
      const clearPromptWatchdog = () => {
        if (promptWatchdog) {
          clearTimeout(promptWatchdog);
          promptWatchdog = null;
        }
      };
      const forwardEvent = (event: AgentEvent) => {
        if (
          event.type === "state.changed" &&
          (event.status === "idle" || event.status === "error")
        ) {
          promptEventSessionAdoptionEnabled = false;
          activePromptRequestId = null;
          clearPromptWatchdog();
        }
        onEvent(event);
      };
      const sessionId = payload.session.id;
      const updateNativeSessionTitle = createNativeSessionTitleTracker({
        initialTitle: payload.providerSession ? null : payload.session.title,
        isUsableTitle: (title) => !/^New session(?:\s*-.*)?$/i.test(title),
        onEvent,
        sessionId,
      });

      function persistActiveSession(nextSessionId: string) {
        payload.onProviderSessionUpdate?.({
          sessionId,
          providerSessionId: nextSessionId,
          providerStateJson: serializeProviderSessionState({
            adapter: "opencode",
          }),
          providerVersion: OPENCODE_PROVIDER_VERSION,
          resumable: true,
          updatedAt: new Date().toISOString(),
        });
      }

      function claimSession(nextSessionId: string) {
        if (activeSessionId === nextSessionId) return;

        if (activeSessionId) {
          claimedOpenCodeSessionIds.delete(activeSessionId);
        }
        activeSessionId = nextSessionId;
        claimedOpenCodeSessionIds.add(nextSessionId);
        persistActiveSession(nextSessionId);
      }

      async function createFreshSession(runtimeClient: OpencodeClient) {
        const sessionData = await expectOpenCodeData(
          runtimeClient.session.create({
            query: {
              directory: payload.workspaceRootPath,
            },
          }),
          "create session",
        );
        if (!sessionData.id) {
          throw new Error("OpenCode create session returned no session id");
        }
        if (disposed) {
          await runtimeClient.session.delete({
            path: { id: sessionData.id },
            query: { directory: payload.workspaceRootPath },
          });
          throw new Error("OpenCode session was disposed during creation");
        }
        claimSession(sessionData.id);
        logOpenCode("info", "OpenCode session created", {
          appSessionId: sessionId,
          openCodeSessionId: activeSessionId,
        });
      }

      const eventHandler = new OpenCodeEventHandler({
        sessionId,
        parentSession: payload.session,
        isDisposed: () => disposed,
        getOpenCodeSessionId: () => activeSessionId,
        shouldAdoptOpenCodeSession(eventSessionId, eventType, parentSessionId) {
          return (
            promptEventSessionAdoptionEnabled &&
            !acceptedOpenCodeEventForPrompt &&
            (eventType.startsWith("message.") ||
              eventType === "session.status" ||
              eventType === "session.diff" ||
              eventType === "session.idle") &&
            eventSessionId !== activeSessionId &&
            !claimedOpenCodeSessionIds.has(eventSessionId) &&
            (!parentSessionId ||
              !claimedOpenCodeSessionIds.has(parentSessionId))
          );
        },
        onOpenCodeSessionAdopted(eventSessionId) {
          claimSession(eventSessionId);
          acceptedOpenCodeEventForPrompt = true;
          clearPromptWatchdog();
        },
        onOpenCodeSessionEvent() {
          if (promptEventSessionAdoptionEnabled) {
            acceptedOpenCodeEventForPrompt = true;
            clearPromptWatchdog();
          }
        },
        onOpenCodeTurnSettled() {
          turnCompletion.settle();
        },
        onEvent: forwardEvent,
        async resolveMessage(messageId) {
          if (!client || !activeSessionId) {
            return null;
          }

          const message = await expectOpenCodeData(
            client.session.message({
              path: {
                id: activeSessionId,
                messageID: messageId,
              },
              query: {
                directory: payload.workspaceRootPath,
              },
            }),
            "resolve message snapshot",
          );

          return {
            info: message?.info,
            parts: message?.parts ?? [],
          };
        },
        async resolveSession(openCodeSessionId) {
          if (!client) {
            return null;
          }

          const messages = await expectOpenCodeData(
            client.session.messages({
              path: {
                id: openCodeSessionId,
              },
              query: {
                directory: payload.workspaceRootPath,
                limit: 100,
              },
            }),
            "resolve session snapshot",
          );

          return {
            sessionID: openCodeSessionId,
            messages: messages ?? [],
          };
        },
        async resolveSessionInfo(openCodeSessionId) {
          if (!client) {
            return null;
          }

          const info = await expectOpenCodeData(
            client.session.get({
              path: {
                id: openCodeSessionId,
              },
              query: {
                directory: payload.workspaceRootPath,
              },
            }),
            "resolve session info",
          );

          return {
            id: info.id,
            parentID: info.parentID,
            title: info.title,
          };
        },
        onPermissionUpdated(permission) {
          void (async () => {
            if (!client || !activeSessionId) {
              return;
            }

            const request = createOpenCodePermissionRequest(
              payload,
              permission,
            );
            const decision =
              activePermissionMode === "opencode-allow"
                ? "allow_once"
                : activePermissionMode === "opencode-deny"
                  ? "reject_once"
                  : ((await payload.requestPermission?.(request)) ??
                    "reject_once");

            await expectOpenCodeSuccess(
              client.postSessionIdPermissionsPermissionId({
                path: {
                  id: activeSessionId,
                  permissionID: permission.id,
                },
                query: {
                  directory: payload.workspaceRootPath,
                },
                body: {
                  response: mapOpenCodeDecision(decision),
                },
              }),
              "resolve permission",
            );
          })().catch((error) => {
            logOpenCode("error", "Permission request failed", {
              appSessionId: sessionId,
              openCodeSessionId: activeSessionId,
              error: formatOpenCodeError(error),
            });
          });
        },
        onQuestionAsked(question) {
          void (async () => {
            const currentRuntime = runtime;
            if (disposed || !currentRuntime) {
              return;
            }

            await resolveOpenCodeQuestion(payload, currentRuntime, question);
          })().catch((error) => {
            logOpenCode("error", "Question request failed", {
              appSessionId: sessionId,
              openCodeSessionId: activeSessionId,
              requestId: question.id,
              error: formatOpenCodeError(error),
            });
          });
        },
      });

      const initPromise = (async () => {
        logOpenCode("info", "Initializing session", {
          appSessionId: sessionId,
          title: payload.session.title,
          workspaceRootPath: payload.workspaceRootPath,
        });

        try {
          runtime = await acquireOpenCodeRuntime();
          const runtimeClient = runtime.client;
          client = runtimeClient;
          clientV2 = runtime.clientV2;
          if (disposed) {
            throw new Error("OpenCode session was disposed during startup");
          }

          const savedSessionId =
            payload.providerSession?.resumable === false
              ? null
              : (payload.providerSession?.providerSessionId ?? null);
          if (
            savedSessionId &&
            !claimedOpenCodeSessionIds.has(savedSessionId)
          ) {
            try {
              const savedSession = await expectOpenCodeData(
                runtimeClient.session.get({
                  path: { id: savedSessionId },
                  query: { directory: payload.workspaceRootPath },
                }),
                "resume session",
              );
              if (savedSession.id !== savedSessionId) {
                throw new Error(
                  `OpenCode returned session ${savedSession.id} for ${savedSessionId}`,
                );
              }
              if (disposed) {
                throw new Error("OpenCode session was disposed during resume");
              }
              claimSession(savedSessionId);
              logOpenCode("info", "OpenCode session resumed", {
                appSessionId: sessionId,
                openCodeSessionId: savedSessionId,
              });
            } catch (error) {
              logOpenCode("warn", "Saved OpenCode session is unavailable", {
                appSessionId: sessionId,
                openCodeSessionId: savedSessionId,
                error: formatOpenCodeError(error),
              });
              if (!isOpenCodeNotFound(error)) {
                throw createNativeSessionRecoveryError("OpenCode");
              }
            }
          } else if (savedSessionId) {
            logOpenCode("warn", "Saved OpenCode session is already claimed", {
              appSessionId: sessionId,
              openCodeSessionId: savedSessionId,
            });
            throw createNativeSessionRecoveryError("OpenCode");
          }

          eventAbortController = new AbortController();
          logOpenCode("debug", "Subscribing to event stream", {
            appSessionId: sessionId,
            openCodeSessionId: activeSessionId,
            workspaceRootPath: payload.workspaceRootPath,
          });
          const eventStream = await runtimeClient.event.subscribe({
            query: {
              directory: payload.workspaceRootPath,
            },
            signal: eventAbortController.signal,
          });
          if (disposed) {
            throw new Error(
              "OpenCode session was disposed during subscription",
            );
          }
          logOpenCode("info", "Event stream subscribed", {
            appSessionId: sessionId,
            openCodeSessionId: activeSessionId,
          });
          initializationFinished = true;

          (async () => {
            try {
              for await (const raw of eventStream.stream) {
                if (disposed) break;
                if (
                  raw.type === "session.updated" &&
                  raw.properties.info.id === activeSessionId
                ) {
                  updateNativeSessionTitle(raw.properties.info.title);
                }
                if (raw.type === "message.updated") {
                  const info = (
                    raw as {
                      properties?: { info?: { id?: string; role?: string } };
                    }
                  ).properties?.info;
                  if (
                    info?.role === "user" &&
                    info.id === lastProviderUserMessageId
                  ) {
                    lastProviderUserMessageId = info.id;
                  }
                }
                if (raw.type === "session.diff" && lastProviderUserMessageId) {
                  const diffs = raw.properties.diff ?? [];
                  lastNativeDiff = {
                    ...openCodeDiffsToEvidence(diffs),
                    providerTurnId: lastProviderUserMessageId,
                  };
                  emitNativeWorkspaceEvidence(
                    onEvent,
                    sessionId,
                    lastUserMessageId,
                    lastNativeDiff,
                  );
                }
                eventHandler.handleEvent(raw as OpenCodeEvent);
              }
              logOpenCode("warn", "Event stream ended", {
                appSessionId: sessionId,
                openCodeSessionId: activeSessionId,
              });
              if (!disposed) {
                onEvent({
                  type: "error",
                  sessionId,
                  message: "OpenCode event stream ended unexpectedly.",
                });
                forwardEvent({
                  type: "state.changed",
                  sessionId,
                  status: "error",
                });
                turnCompletion.settle();
              }
            } catch (error) {
              if (disposed || eventAbortController?.signal.aborted) return;

              logOpenCode("error", "Event stream failed", {
                appSessionId: sessionId,
                openCodeSessionId: activeSessionId,
                error: formatOpenCodeError(error),
              });

              onEvent({
                type: "error",
                sessionId,
                message: formatOpenCodeUserFacingError(error),
              });

              onEvent({
                type: "state.changed",
                sessionId,
                status: "error",
              });
              turnCompletion.settle();
            }
          })();
        } catch (error) {
          if (!disposed) {
            logOpenCode("error", "Session initialization failed", {
              appSessionId: sessionId,
              workspaceRootPath: payload.workspaceRootPath,
              error: formatOpenCodeError(error),
            });
          }
          if (activeSessionId) {
            claimedOpenCodeSessionIds.delete(activeSessionId);
            activeSessionId = null;
          }
          eventAbortController?.abort();
          eventAbortController = null;
          client = null;
          clientV2 = null;
          releaseOpenCodeRuntime(runtime);
          runtime = null;
          initializationFinished = true;
          initializationError = error;
        }
      })();

      return {
        async sendMessage(
          messagePayload: SendAgentMessagePayload,
        ): Promise<MessageRecord> {
          const requestId = crypto.randomUUID();
          const providerUserMessageId = createOpenCodeMessageId();
          const userMessage: MessageRecord = {
            id: messagePayload.messageId ?? crypto.randomUUID(),
            sessionId,
            role: "user",
            content: messagePayload.content.trim(),
            attachments: messagePayload.attachments ?? [],
            createdAt: new Date().toISOString(),
          };
          lastUserMessageId = userMessage.id;
          lastProviderUserMessageId = providerUserMessageId;
          lastNativeDiff = null;

          if (messagePayload.permissionMode !== undefined) {
            activePermissionMode = messagePayload.permissionMode ?? undefined;
          }

          logOpenCode("info", "sendMessage called", {
            requestId,
            appSessionId: sessionId,
            contentLength: messagePayload.content.length,
            attachmentCount: messagePayload.attachments?.length ?? 0,
          });

          eventHandler.resetForMessage();

          onEvent({
            type: "state.changed",
            sessionId,
            status: "running",
          });

          const turnPromise = (async () => {
            const startedAt = performance.now();
            const terminal = turnCompletion.begin(requestId);
            try {
              await initPromise;

              if (initializationError) {
                throw initializationError;
              }

              if (!client) {
                logOpenCode("error", "sendMessage missing initialized client", {
                  requestId,
                  appSessionId: sessionId,
                  hasClient: client !== null,
                  openCodeSessionId: activeSessionId,
                });
                throw new Error("OpenCode client not initialized");
              }

              const selectedModel =
                messagePayload.providerSnapshot ??
                payload.session.providerSnapshot;
              const promptClient = clientV2;
              if (!promptClient) {
                throw new Error("OpenCode v2 client not initialized");
              }
              if (selectedModel) {
                const catalog = await expectOpenCodeData(
                  promptClient.provider.list(),
                  "validate selected model",
                );
                assertOpenCodeModelAvailable(catalog, selectedModel);
              }

              if (!activeSessionId) {
                if (requiresNativeSessionRecovery(messagePayload.history)) {
                  throw createNativeSessionRecoveryError("OpenCode");
                }
                await createFreshSession(client);
              }
              if (!activeSessionId) {
                throw new Error("OpenCode session not initialized");
              }
              const prompt = buildPrompt(
                messagePayload.content,
                messagePayload.attachments ?? [],
              );
              logOutgoingPromptForDiagnostics({
                agentId: "opencode",
                attachments: messagePayload.attachments ?? [],
                history: messagePayload.history,
                prompt,
                sessionId,
              });
              const parts = buildPromptParts(
                messagePayload.content,
                messagePayload.attachments ?? [],
              );
              const promptSelection = getOpenCodePromptSelection(selectedModel);

              logOpenCode("info", "Prompt request starting", {
                requestId,
                appSessionId: sessionId,
                openCodeSessionId: activeSessionId,
                providerId: selectedModel?.providerId ?? null,
                modelId: selectedModel?.modelId ?? null,
                promptLength: prompt.length,
              });
              const promptStartedAt = Date.now();
              promptEventSessionAdoptionEnabled = true;
              acceptedOpenCodeEventForPrompt = false;
              activePromptRequestId = requestId;
              clearPromptWatchdog();

              await expectOpenCodeSuccess(
                promptClient.session.promptAsync({
                  sessionID: activeSessionId,
                  directory: payload.workspaceRootPath,
                  messageID: providerUserMessageId,
                  ...(selectedModel
                    ? {
                        model: {
                          providerID: selectedModel.providerId,
                          modelID: selectedModel.modelId,
                        },
                      }
                    : {}),
                  // Built-in plan agent enforces edit denial server-side;
                  // the tools blacklist stays as defense for older opencode
                  // binaries. The agent persists on the session, so non-plan
                  // prompts must explicitly switch back to "build".
                  ...(payload.session.collaborationMode === "plan"
                    ? {
                        agent: "plan",
                        system: OPENCODE_PLAN_SYSTEM,
                        tools: OPENCODE_PLAN_TOOLS,
                      }
                    : { agent: promptSelection.agent ?? "build" }),
                  ...(promptSelection.variant
                    ? { variant: promptSelection.variant }
                    : {}),
                  parts,
                }),
                "send message",
              );
              logOpenCode("info", "Prompt request accepted", {
                requestId,
                appSessionId: sessionId,
                openCodeSessionId: activeSessionId,
                durationMs: Math.round(performance.now() - startedAt),
              });
              promptWatchdog = setTimeout(() => {
                promptWatchdog = null;
                if (
                  disposed ||
                  activePromptRequestId !== requestId ||
                  acceptedOpenCodeEventForPrompt ||
                  !activeSessionId ||
                  eventHandler.lastEventAt >= promptStartedAt
                ) {
                  return;
                }

                const timedOutSessionId = activeSessionId;
                promptEventSessionAdoptionEnabled = false;
                activePromptRequestId = null;
                logOpenCode("error", "No OpenCode events after prompt start", {
                  requestId,
                  appSessionId: sessionId,
                  openCodeSessionId: timedOutSessionId,
                  elapsedMs: Date.now() - promptStartedAt,
                });
                onEvent({
                  type: "error",
                  sessionId,
                  message:
                    "OpenCode accepted the prompt but did not respond. Retry after refreshing the model list.",
                });
                onEvent({
                  type: "state.changed",
                  sessionId,
                  status: "error",
                });
                turnCompletion.settle(requestId);
                void expectOpenCodeSuccess(
                  promptClient.session.abort({
                    sessionID: timedOutSessionId,
                    directory: payload.workspaceRootPath,
                  }),
                  "abort unresponsive session",
                ).catch((error) => {
                  logOpenCode("error", "Unresponsive session abort failed", {
                    requestId,
                    appSessionId: sessionId,
                    openCodeSessionId: timedOutSessionId,
                    error: formatOpenCodeError(error),
                  });
                });
              }, OPENCODE_FIRST_EVENT_TIMEOUT_MS);
              await terminal;
            } catch (error) {
              promptEventSessionAdoptionEnabled = false;
              if (activePromptRequestId === requestId) {
                activePromptRequestId = null;
                clearPromptWatchdog();
              }
              logOpenCode("error", "Prompt request failed", {
                requestId,
                appSessionId: sessionId,
                openCodeSessionId: activeSessionId,
                durationMs: Math.round(performance.now() - startedAt),
                error: formatOpenCodeError(error),
              });
              if (disposed) return;
              onEvent({
                type: "error",
                sessionId,
                message: formatOpenCodeUserFacingError(error),
              });
              onEvent({
                type: "state.changed",
                sessionId,
                status: "error",
              });
            } finally {
              turnCompletion.settle(requestId);
            }
          })();
          activeTurnPromise = turnPromise;
          void turnPromise.finally(() => {
            if (activeTurnPromise === turnPromise) {
              activeTurnPromise = null;
            }
          });

          await turnPromise;
          return userMessage;
        },
        async stop() {
          logOpenCode("info", "Stop requested", {
            appSessionId: sessionId,
            openCodeSessionId: activeSessionId,
            hasClient: client !== null,
          });
          activePromptRequestId = null;
          clearPromptWatchdog();

          const currentClientV2 = clientV2;
          const currentSessionId = activeSessionId;
          if (!disposed && currentClientV2 && currentSessionId) {
            try {
              await expectOpenCodeSuccess(
                currentClientV2.session.abort({
                  sessionID: currentSessionId,
                  directory: payload.workspaceRootPath,
                }),
                "abort session",
              );
            } catch (error) {
              logOpenCode("error", "Abort request failed", {
                appSessionId: sessionId,
                openCodeSessionId: currentSessionId,
                error: formatOpenCodeError(error),
              });
            }
          }
          turnCompletion.settle();
          await activeTurnPromise;
        },
        getWorkspaceChangeCapabilities() {
          return {
            turnDiff: "full" as const,
            fileRewind: "none" as const,
            coverage: "provider-file-tools" as const,
            conversationRevert: false,
          };
        },
        async collectNativeWorkspaceChanges(input) {
          const providerMessageId =
            lastProviderUserMessageId ?? input.providerTurnId ?? null;
          if (
            lastNativeDiff?.providerTurnId &&
            providerMessageId &&
            lastNativeDiff.providerTurnId !== providerMessageId
          ) {
            lastNativeDiff = null;
          }
          if (client && activeSessionId && providerMessageId) {
            try {
              const diffs = await expectOpenCodeData(
                client.session.diff({
                  path: { id: activeSessionId },
                  query: {
                    directory: payload.workspaceRootPath,
                    messageID: providerMessageId,
                  },
                }),
                "session diff",
              );
              lastNativeDiff = {
                ...openCodeDiffsToEvidence(diffs ?? []),
                providerTurnId: providerMessageId,
              };
              return lastNativeDiff;
            } catch {
              return lastNativeDiff;
            }
          }
          return lastNativeDiff;
        },
        dispose() {
          logOpenCode("info", "Disposing session", {
            appSessionId: sessionId,
            openCodeSessionId: activeSessionId,
          });
          disposed = true;
          turnCompletion.settle();
          activePromptRequestId = null;
          clearPromptWatchdog();
          if (activeSessionId) {
            claimedOpenCodeSessionIds.delete(activeSessionId);
          }
          eventAbortController?.abort();
          eventAbortController = null;
          client = null;
          clientV2 = null;
          if (initializationFinished) {
            releaseOpenCodeRuntime(runtime);
            runtime = null;
          }
        },
      };
    },
  };
}
