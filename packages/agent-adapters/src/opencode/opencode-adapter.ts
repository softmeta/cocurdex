import { realpath } from "node:fs/promises";
import type {
  AgentAdapter,
  AgentSession,
  CreateAgentSessionPayload,
  SendAgentMessagePayload,
} from "@cocurdex/agent-core";
import { getAgentDescriptor } from "@cocurdex/agent-core";
import type { AgentEvent, MessageRecord } from "@cocurdex/shared";
import type { OpenCodeEvent } from "@opencode/client";
import {
  logOutgoingPromptForDiagnostics,
  serializeProviderSessionState,
} from "../shared";
import { createNativeSessionTitleTracker } from "../shared/native-session-title";
import {
  createNativeSessionRecoveryError,
  requiresNativeSessionRecovery,
} from "../shared/session-recovery";
import { openCodeDiffsToEvidence } from "../workspace-changes/native-evidence";
import {
  OpenCodeTurn,
  type OpenCodeTurnOutcome,
} from "./opencode-event-handler";
import { buildPrompt, buildPromptInput } from "./opencode-events";
import { createOpenCodeMessageId } from "./opencode-message-id";
import {
  assertOpenCodeModelAvailable,
  listOpenCodeModelsWhenReady,
} from "./opencode-models";
import { replyOpenCodePermission } from "./opencode-permissions";
import { resolveOpenCodeForm } from "./opencode-questions";
import {
  connectOpenCode,
  formatOpenCodeError,
  isOpenCodeSessionNotFound,
  logOpenCode,
  type OpenCodeClient,
} from "./opencode-runtime";
import {
  getSessionSelection,
  isSameModel,
  OPENCODE_BUILD_AGENT,
  type OpenCodeSessionSelection,
} from "./opencode-selection";

const descriptor = getAgentDescriptor("opencode");

// OpenCode session IDs currently owned by a live adapter instance in this
// process. A saved session must never be resumed by two Cocurdex sessions.
const claimedOpenCodeSessionIds = new Set<string>();
const OPENCODE_PROVIDER_VERSION = "opencode";

export interface DeleteOpenCodeSessionPayload {
  providerSessionId: string;
}

export async function deleteOpenCodeSession(
  payload: DeleteOpenCodeSessionPayload,
) {
  const client = await connectOpenCode();
  try {
    await client.session.remove({ sessionID: payload.providerSessionId });
  } catch (error) {
    if (!isOpenCodeSessionNotFound(error)) throw error;
  }
}

function resolveSnapshotCapableDirectory(directory: string) {
  return realpath(directory).catch(() => directory);
}

interface ActiveTurn {
  stream: AbortController;
  turn: OpenCodeTurn | null;
  stopRequested: boolean;
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
      let client: OpenCodeClient | null = null;
      let initializationError: unknown = null;
      let activeSessionId: string | null = null;
      let sessionSelection: OpenCodeSessionSelection | null = null;
      let activeTurn: ActiveTurn | null = null;
      let activeTurnPromise: Promise<void> | null = null;
      let activePermissionMode = payload.session.permissionMode;
      let lastProviderUserMessageId: string | null = null;
      let lastNativeDiff: ReturnType<typeof openCodeDiffsToEvidence> | null =
        null;
      const sessionId = payload.session.id;
      const updateNativeSessionTitle = createNativeSessionTitleTracker({
        initialTitle: payload.providerSession ? null : payload.session.title,
        isUsableTitle: (title) => !/^New session(?:\s*-.*)?$/i.test(title),
        onEvent,
        sessionId,
      });

      function claimSession(
        nextSessionId: string,
        selection: OpenCodeSessionSelection,
      ) {
        if (activeSessionId) {
          claimedOpenCodeSessionIds.delete(activeSessionId);
        }
        activeSessionId = nextSessionId;
        sessionSelection = selection;
        claimedOpenCodeSessionIds.add(nextSessionId);
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

      async function resumeSavedSession(openCodeClient: OpenCodeClient) {
        const savedSessionId =
          payload.providerSession?.resumable === false
            ? null
            : (payload.providerSession?.providerSessionId ?? null);
        if (!savedSessionId) return;

        if (claimedOpenCodeSessionIds.has(savedSessionId)) {
          logOpenCode("warn", "Saved OpenCode session is already claimed", {
            appSessionId: sessionId,
            openCodeSessionId: savedSessionId,
          });
          throw createNativeSessionRecoveryError("OpenCode");
        }

        try {
          const saved = await openCodeClient.session.get({
            sessionID: savedSessionId,
          });
          if (disposed) {
            throw new Error("OpenCode session was disposed during resume");
          }
          claimSession(saved.id, {
            agent: saved.agent ?? OPENCODE_BUILD_AGENT,
            model: saved.model ?? null,
          });
          logOpenCode("info", "OpenCode session resumed", {
            appSessionId: sessionId,
            openCodeSessionId: saved.id,
          });
        } catch (error) {
          logOpenCode("warn", "Saved OpenCode session is unavailable", {
            appSessionId: sessionId,
            openCodeSessionId: savedSessionId,
            error: formatOpenCodeError(error),
          });
          if (!isOpenCodeSessionNotFound(error)) {
            throw createNativeSessionRecoveryError("OpenCode");
          }
        }
      }

      const initPromise = (async () => {
        try {
          const openCodeClient = await connectOpenCode();
          if (disposed) {
            throw new Error("OpenCode session was disposed during startup");
          }
          client = openCodeClient;
          await resumeSavedSession(openCodeClient);
        } catch (error) {
          if (!disposed) {
            logOpenCode("error", "Session initialization failed", {
              appSessionId: sessionId,
              error: formatOpenCodeError(error),
            });
          }
          initializationError = error;
        }
      })();

      async function prepareSession(
        openCodeClient: OpenCodeClient,
        messagePayload: SendAgentMessagePayload,
      ) {
        const snapshot =
          messagePayload.providerSnapshot ?? payload.session.providerSnapshot;
        if (snapshot) {
          const models = await listOpenCodeModelsWhenReady(
            openCodeClient,
            payload.workspaceRootPath,
          );
          assertOpenCodeModelAvailable(models, snapshot);
        }

        const selection = getSessionSelection(
          payload.session.sessionModeId,
          snapshot,
        );
        if (!activeSessionId) {
          if (requiresNativeSessionRecovery(messagePayload.history)) {
            throw createNativeSessionRecoveryError("OpenCode");
          }
          const created = await openCodeClient.session.create({
            location: {
              directory: await resolveSnapshotCapableDirectory(
                payload.workspaceRootPath,
              ),
            },
            agent: selection.agent,
            ...(selection.model ? { model: selection.model } : {}),
          });
          if (disposed) {
            await openCodeClient.session.remove({ sessionID: created.id });
            throw new Error("OpenCode session was disposed during creation");
          }
          claimSession(created.id, selection);
          logOpenCode("info", "OpenCode session created", {
            appSessionId: sessionId,
            openCodeSessionId: created.id,
          });
          return created.id;
        }

        const openCodeSessionId = activeSessionId;
        if (sessionSelection?.agent !== selection.agent) {
          await openCodeClient.session.switchAgent({
            sessionID: openCodeSessionId,
            agent: selection.agent,
          });
        }
        if (
          selection.model &&
          !isSameModel(sessionSelection?.model ?? null, selection.model)
        ) {
          await openCodeClient.session.switchModel({
            sessionID: openCodeSessionId,
            model: selection.model,
          });
        }
        sessionSelection = {
          agent: selection.agent,
          model: selection.model ?? sessionSelection?.model ?? null,
        };
        return openCodeSessionId;
      }

      async function runTurn(
        turnState: ActiveTurn,
        messagePayload: SendAgentMessagePayload,
        providerUserMessageId: string,
      ): Promise<OpenCodeTurnOutcome | null> {
        await initPromise;
        if (initializationError) throw initializationError;
        const openCodeClient = client;
        if (!openCodeClient) throw new Error("OpenCode client not initialized");

        const openCodeSessionId = await prepareSession(
          openCodeClient,
          messagePayload,
        );
        const attachments = messagePayload.attachments ?? [];
        logOutgoingPromptForDiagnostics({
          agentId: "opencode",
          attachments,
          history: messagePayload.history,
          prompt: buildPrompt(messagePayload.content, attachments),
          sessionId,
        });

        const turn = new OpenCodeTurn({
          sessionId,
          parentSession: payload.session,
          openCodeSessionId,
          promptId: providerUserMessageId,
          onEvent,
          onPermissionAsked(permission) {
            void replyOpenCodePermission(
              payload,
              openCodeClient,
              permission,
              activePermissionMode,
            ).catch((error) => {
              logOpenCode("error", "Permission request failed", {
                appSessionId: sessionId,
                openCodeSessionId: permission.sessionID,
                error: formatOpenCodeError(error),
              });
            });
          },
          onFormCreated(form) {
            void resolveOpenCodeForm(payload, openCodeClient, form).catch(
              (error) => {
                logOpenCode("error", "Form request failed", {
                  appSessionId: sessionId,
                  formId: form.id,
                  error: formatOpenCodeError(error),
                });
              },
            );
          },
          onTitle: updateNativeSessionTitle,
        });
        turnState.turn = turn;

        const events = openCodeClient.event
          .subscribe({ signal: turnState.stream.signal })
          [Symbol.asyncIterator]();
        let outcome: OpenCodeTurnOutcome | null;
        try {
          const connected = await events.next();
          if (connected.done) {
            throw new Error("OpenCode event stream closed before the prompt");
          }
          const consumed = (async () => {
            while (true) {
              const next: IteratorResult<OpenCodeEvent> = await events.next();
              if (next.done) {
                if (turnState.stopRequested) return null;
                throw new Error("OpenCode event stream ended unexpectedly.");
              }
              const result = turn.handle(next.value);
              if (result) return result;
            }
          })();
          void consumed.catch(() => undefined);

          await openCodeClient.session.prompt({
            sessionID: openCodeSessionId,
            id: providerUserMessageId,
            ...buildPromptInput(messagePayload.content, attachments),
            delivery: "steer",
          });
          logOpenCode("info", "Prompt admitted", {
            appSessionId: sessionId,
            openCodeSessionId,
          });
          outcome = await consumed;
        } finally {
          turnState.stream.abort();
          await events.return?.();
        }

        const info = await openCodeClient.session
          .get({ sessionID: openCodeSessionId })
          .catch(() => null);
        if (info?.title) updateNativeSessionTitle(info.title);
        return outcome;
      }

      return {
        async sendMessage(
          messagePayload: SendAgentMessagePayload,
        ): Promise<MessageRecord> {
          const providerUserMessageId = createOpenCodeMessageId();
          const userMessage: MessageRecord = {
            id: messagePayload.messageId ?? crypto.randomUUID(),
            sessionId,
            role: "user",
            content: messagePayload.content.trim(),
            attachments: messagePayload.attachments ?? [],
            createdAt: new Date().toISOString(),
          };
          lastProviderUserMessageId = providerUserMessageId;
          lastNativeDiff = null;
          if (messagePayload.permissionMode !== undefined) {
            activePermissionMode = messagePayload.permissionMode ?? undefined;
          }

          onEvent({ type: "state.changed", sessionId, status: "running" });

          const turnState: ActiveTurn = {
            stream: new AbortController(),
            turn: null,
            stopRequested: false,
          };
          activeTurn = turnState;
          const turnPromise = runTurn(
            turnState,
            messagePayload,
            providerUserMessageId,
          )
            .then((outcome) => {
              if (!outcome && !disposed) {
                onEvent({ type: "state.changed", sessionId, status: "idle" });
              }
            })
            .catch((error) => {
              logOpenCode("error", "Prompt request failed", {
                appSessionId: sessionId,
                openCodeSessionId: activeSessionId,
                error: formatOpenCodeError(error),
              });
              if (disposed) return;
              if (turnState.stopRequested) {
                onEvent({ type: "state.changed", sessionId, status: "idle" });
                return;
              }
              onEvent({
                type: "error",
                sessionId,
                message: formatOpenCodeError(error),
              });
              onEvent({ type: "state.changed", sessionId, status: "error" });
            })
            .finally(() => {
              if (activeTurn === turnState) activeTurn = null;
            });
          activeTurnPromise = turnPromise;

          await turnPromise;
          return userMessage;
        },
        async stop() {
          const turnState = activeTurn;
          const openCodeClient = client;
          const openCodeSessionId = activeSessionId;
          if (!turnState) return;

          turnState.stopRequested = true;
          if (openCodeClient && openCodeSessionId) {
            try {
              await openCodeClient.session.interrupt({
                sessionID: openCodeSessionId,
              });
            } catch (error) {
              logOpenCode("error", "Interrupt request failed", {
                appSessionId: sessionId,
                openCodeSessionId,
                error: formatOpenCodeError(error),
              });
            }
          }
          if (!turnState.turn?.hasStarted) {
            turnState.stream.abort();
          }
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
          if (!client || !activeSessionId || !providerMessageId) {
            return lastNativeDiff;
          }

          try {
            const diffs = await client.session.diff({
              sessionID: activeSessionId,
              from: providerMessageId,
            });
            lastNativeDiff = {
              ...openCodeDiffsToEvidence(diffs),
              providerTurnId: providerMessageId,
            };
          } catch (error) {
            logOpenCode("warn", "Session diff failed", {
              appSessionId: sessionId,
              error: formatOpenCodeError(error),
            });
          }
          return lastNativeDiff;
        },
        dispose() {
          disposed = true;
          activeTurn?.stream.abort();
          activeTurn = null;
          if (activeSessionId) {
            claimedOpenCodeSessionIds.delete(activeSessionId);
          }
          client = null;
        },
      };
    },
  };
}
