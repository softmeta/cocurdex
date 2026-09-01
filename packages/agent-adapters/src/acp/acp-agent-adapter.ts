import {
  type ContentBlock,
  RequestError,
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import type {
  AgentAdapter,
  AgentSession,
  CreateAgentSessionPayload,
  SendAgentMessagePayload,
} from "@cocurdex/agent-core";
import { AgentSteeringUnavailableError } from "@cocurdex/agent-core";
import type {
  AgentDescriptor,
  AgentMcpServerRuntime,
  AgentNegotiatedCapabilities,
  AgentPermissionMode,
  AgentRateLimitsRecord,
  MessageRecord,
  SessionRecord,
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
import type { AcpConnection, AcpConnectionFactory } from "./acp-connection";
import {
  type AcpContextUsage,
  AcpEventMapper,
  mapSessionConfigOptions,
} from "./acp-event-mapper";
import {
  buildAcpPrompt,
  mapNegotiatedCapabilities,
  mapPermissionDecision,
  rejectPermission,
} from "./acp-mappers";
import {
  type AcpSessionModelState,
  readAcpSessionModelState,
  resolveAcpModelId,
  resolveAcpReasoningEffort,
} from "./acp-session-model";
import {
  AcpSubagentBridge,
  type AcpSubagentProtocol,
} from "./acp-subagent-bridge";
import { createSdkAcpConnection } from "./sdk-acp-connection";

export type { AcpConnection, AcpConnectionFactory } from "./acp-connection";

export interface AcpAgentAdapterOptions {
  args: string[];
  authMethodPriority?: string[];
  command: string;
  descriptor: AgentDescriptor;
  initializeMeta?: Record<string, unknown>;
  // Provider ID whose catalog-backed model selection this ACP adapter owns.
  // Other ACP agents keep their native/default model behavior.
  modelProviderId?: string;
  // Agents whose permission mode is set through a vendor ext notification map
  // it here; returning null means "this agent has nothing to send".
  permissionModeNotification?: {
    method: string;
    buildParams(mode: AgentPermissionMode): Record<string, unknown> | null;
  };
  rateLimitsRequest?: {
    method: string;
    mapResponse(value: unknown): AgentRateLimitsRecord | null;
  };
  // Agents that recompute their context fill while restoring a session report
  // the new value only on request: the restore emits no session notification,
  // so a client that only listens would keep displaying the pre-restore number
  // until the next turn. Configure the read here to refresh it right away.
  contextUsageRequest?: {
    method: string;
    buildParams(providerSessionId: string): Record<string, unknown>;
    mapResponse(value: unknown): AcpContextUsage | null;
  };
  // Agents that expose a live MCP catalog (Grok's `x.ai/mcp/list`) report it
  // here so the session runtime menu can list connected servers.
  mcpServersRequest?: {
    method: string;
    buildParams(providerSessionId: string): Record<string, unknown>;
    mapResponse(value: unknown): AgentMcpServerRuntime[] | null;
    // Ext notifications that mean "the catalog moved" (a server finished its
    // handshake, died, or was reconfigured). Without them the catalog is only
    // sampled at session start — while servers are still initializing — and
    // after a turn ends, so the whole first turn shows stale statuses.
    changeNotifications?: string[];
  };
  // Tool-call titles whose plan body travels inline with the call rather than
  // living in the agent's own plan file. Drives the reference format the user's
  // review feedback has to use, nothing else.
  inlinePlanToolTitles?: string[];
  steeringRequest?: {
    method: string;
    buildParams(input: {
      messageId: string;
      prompt: ContentBlock[];
      providerSessionId: string;
    }): Record<string, unknown>;
  };
  subagentProtocol?: AcpSubagentProtocol;
  // Runs after initialize + auth and before session/new. Grok Build uses this
  // to wait for the remote model catalog so session/new advertises every model.
  afterInitialize?(connection: AcpConnection): Promise<void>;
}

// Servers finish handshaking in a burst, and each one pushes its own status
// notification. Coalesce them into a single catalog re-read.
const MCP_CHANGE_DEBOUNCE_MS = 300;

export class AcpAgentAdapter implements AgentAdapter {
  constructor(
    private readonly options: AcpAgentAdapterOptions,
    private readonly connectionFactory: AcpConnectionFactory = createSdkAcpConnection,
  ) {}

  getDescriptor() {
    return this.options.descriptor;
  }

  createSession(
    payload: CreateAgentSessionPayload,
    onEvent: Parameters<AgentAdapter["createSession"]>[1],
  ): AgentSession {
    const childMappers = new Map<string, AcpEventMapper>();
    const completedChildReplays = new Set<string>();
    const childReplayAttempts = new Map<string, number>();
    const scheduledChildReplays = new Set<string>();
    let subagentBridge: AcpSubagentBridge | null = null;
    let replayLinkedSession: (providerSessionId: string) => void = () =>
      undefined;
    const mapper = new AcpEventMapper(
      payload.session.id,
      onEvent,
      undefined,
      payload.providerSession ? null : payload.session.title,
      (toolCall) =>
        subagentBridge ? subagentBridge.transform(toolCall) : toolCall,
    );
    const createChildMapper = (session: SessionRecord) => {
      const existing = childMappers.get(session.id);
      if (existing) {
        return existing;
      }
      const childMapper = new AcpEventMapper(session.id, onEvent);
      childMappers.set(session.id, childMapper);
      return childMapper;
    };
    if (this.options.subagentProtocol) {
      subagentBridge = new AcpSubagentBridge(
        payload.session,
        this.options.subagentProtocol,
        onEvent,
        (_providerSessionId, session, notifications) => {
          const childMapper = createChildMapper(session);
          for (const notification of notifications) {
            childMapper.handle(notification);
          }
        },
        (providerSessionId) => {
          const childSession =
            subagentBridge?.getChildSession(providerSessionId);
          if (childSession) {
            const childMapper = createChildMapper(childSession);
            if (childMapper.hasPendingTurn()) {
              completedChildReplays.add(providerSessionId);
              childMapper.complete("end_turn", 0);
              return;
            }
          }
          replayLinkedSession(providerSessionId);
        },
      );
    }
    let disposed = false;
    let mcpRefreshTimer: ReturnType<typeof setTimeout> | undefined;
    const inlinePlanToolTitles = new Set(
      this.options.inlinePlanToolTitles ?? [],
    );
    const requestPlanApproval = payload.requestPlanApproval;
    const mcpChangeNotificationMethods =
      this.options.mcpServersRequest?.changeNotifications ?? [];
    const buildInitializeRequest = () => ({
      protocolVersion: 1,
      clientCapabilities: {
        fs: {
          readTextFile: false,
          writeTextFile: false,
        },
        terminal: false,
      },
      clientInfo: {
        name: "Cocurdex",
        title: "Cocurdex",
        version: "0.0.0",
      },
      _meta: this.options.initializeMeta,
    });
    let suppressSessionUpdates = false;
    const routeSessionUpdate = (notification: SessionNotification) => {
      if (suppressSessionUpdates) {
        return;
      }
      const childSession = subagentBridge?.getChildSession(
        notification.sessionId,
      );
      if (childSession) {
        createChildMapper(childSession).handle(notification);
        return;
      }
      if (
        activeProviderSessionId &&
        notification.sessionId !== activeProviderSessionId &&
        subagentBridge
      ) {
        subagentBridge.buffer(notification);
        return;
      }
      mapper.handle(notification);
    };
    const connectionOptions: Parameters<AcpConnectionFactory>[0] = {
      args: this.options.args,
      command: this.options.command,
      cwd: payload.workspaceRootPath,
      extNotificationMethods: [
        ...(this.options.mcpServersRequest?.changeNotifications ?? []),
        ...(this.options.subagentProtocol?.notificationMethods ?? []),
      ],
      handlers: {
        onSessionUpdate(notification) {
          routeSessionUpdate(notification);
        },
        onExtNotification(method, params) {
          subagentBridge?.handleNotification(method, params);
          const sessionNotification =
            subagentBridge?.mapSessionNotification(method, params) ?? null;
          if (sessionNotification) {
            routeSessionUpdate(sessionNotification);
          }
          const completion = subagentBridge?.readTurnCompletion(method, params);
          if (completion) {
            completedChildReplays.add(completion.providerSessionId);
            const childSession = subagentBridge?.getChildSession(
              completion.providerSessionId,
            );
            if (childSession) {
              createChildMapper(childSession).complete(
                completion.stopReason,
                completion.durationMs,
              );
            }
          }
          if (mcpChangeNotificationMethods.includes(method)) {
            scheduleMcpRefresh();
          }
        },
        async requestPermission(request) {
          if (
            payload.session.writeMode === "read-only" &&
            ["delete", "edit", "move"].includes(
              request.toolCall.kind ?? "other",
            )
          ) {
            return rejectPermission(request);
          }

          if (!payload.requestPermission) {
            return { outcome: { outcome: "cancelled" } };
          }

          const decision = await payload.requestPermission({
            id: request.toolCall.toolCallId,
            sessionId: payload.session.id,
            providerId: payload.session.agentType,
            kind: request.toolCall.kind ?? "other",
            title:
              request.toolCall.title ??
              request.toolCall.toolCallId ??
              "Agent tool",
            description: request.options
              .map((option) => option.name)
              .join(", "),
            rawInput: request.toolCall.rawInput,
            locations: request.toolCall.locations?.map((location) => ({
              path: location.path,
              line: location.line,
            })),
            options: request.options.map((option) => ({
              id: option.optionId,
              kind: option.kind,
              label: option.name,
            })),
          });
          return mapPermissionDecision(request, decision);
        },
        exitPlanMode: requestPlanApproval
          ? async (request) => {
              const planContent = request.planContent?.trim()
                ? request.planContent
                : null;
              const title = mapper.getToolCallTitle(request.toolCallId);
              const source =
                title && inlinePlanToolTitles.has(title)
                  ? "inline"
                  : "file-backed";
              const decision = await requestPlanApproval({
                id: request.toolCallId,
                sessionId: payload.session.id,
                providerId: payload.session.agentType,
                planContent,
                source,
              });

              return {
                outcome: decision.outcome,
                ...(decision.feedback ? { feedback: decision.feedback } : {}),
              };
            }
          : undefined,
      },
    };
    let connectionPromise: Promise<AcpConnection> | undefined =
      this.connectionFactory(connectionOptions);
    const getConnection = () => {
      connectionPromise ??= this.connectionFactory(connectionOptions);
      return connectionPromise;
    };
    replayLinkedSession = (providerSessionId) => {
      if (
        !this.options.subagentProtocol?.replayLinkedSession ||
        completedChildReplays.has(providerSessionId) ||
        scheduledChildReplays.has(providerSessionId)
      ) {
        return;
      }
      scheduledChildReplays.add(providerSessionId);
      const attempt = (childReplayAttempts.get(providerSessionId) ?? 0) + 1;
      childReplayAttempts.set(providerSessionId, attempt);
      void this.connectionFactory(connectionOptions)
        .then(async (connection) => {
          try {
            const response = await connection.initialize(
              buildInitializeRequest(),
            );
            const authMethod = this.selectAuthMethod(
              response.authMethods?.map((method) => method.id) ?? [],
            );
            if (authMethod) {
              await connection.authenticate({ methodId: authMethod });
            }
            await connection.loadSession({
              sessionId: providerSessionId,
              cwd: payload.workspaceRootPath,
              mcpServers: [],
            });
          } finally {
            await connection.close();
          }
        })
        .catch((error) => {
          logAdapterDiagnostic(
            "info",
            "[AcpAgentAdapter] child session replay failed",
            {
              agentId: payload.session.agentType,
              childSessionId: providerSessionId,
              error: error instanceof Error ? error.message : String(error),
              parentSessionId: payload.session.id,
            },
          );
          if (attempt < 2 && !completedChildReplays.has(providerSessionId)) {
            scheduledChildReplays.delete(providerSessionId);
            replayLinkedSession(providerSessionId);
          }
        });
    };
    let initialized:
      | Promise<{
          capabilities: AgentNegotiatedCapabilities;
          connection: AcpConnection;
          providerSessionId: string;
        }>
      | undefined;
    let activeProviderSessionId: string | undefined;
    let modelState: AcpSessionModelState | null = null;
    let appliedModelId: string | null = null;
    let appliedReasoningEffort: string | null = null;
    let appliedPermissionMode: AgentPermissionMode | null = null;
    const permissionModeNotification = this.options.permissionModeNotification;
    const steeringRequest = this.options.steeringRequest;
    const rateLimitsRequest = this.options.rateLimitsRequest;
    const contextUsageRequest = this.options.contextUsageRequest;
    const mcpServersRequest = this.options.mcpServersRequest;
    const agentLabel = this.options.descriptor.label;
    const modelProviderId = this.options.modelProviderId;

    const refreshRateLimits = async (connection: AcpConnection) => {
      if (!rateLimitsRequest || disposed) {
        return;
      }
      try {
        const rateLimits = rateLimitsRequest.mapResponse(
          await connection.extRequest(rateLimitsRequest.method, {}),
        );
        if (rateLimits && !disposed) {
          onEvent({
            type: "rate_limits.updated",
            sessionId: payload.session.id,
            rateLimits,
          });
        }
      } catch (error) {
        logAdapterDiagnostic(
          "debug",
          "[AcpAgentAdapter] rate limits unavailable",
          {
            agentId: payload.session.agentType,
            error: error instanceof Error ? error.message : String(error),
            method: rateLimitsRequest.method,
            sessionId: payload.session.id,
          },
        );
      }
    };

    const refreshMcpServers = async (
      connection: AcpConnection,
      providerSessionId: string,
    ) => {
      if (!mcpServersRequest || disposed) {
        return;
      }
      try {
        const mcpServers = mcpServersRequest.mapResponse(
          await connection.extRequest(
            mcpServersRequest.method,
            mcpServersRequest.buildParams(providerSessionId),
          ),
        );
        if (mcpServers && !disposed) {
          onEvent({
            type: "provider.runtime.updated",
            sessionId: payload.session.id,
            receivedAt: new Date().toISOString(),
            runtime: {
              providerId: payload.session.agentType,
              capabilities: [],
              cwd: payload.workspaceRootPath,
              mcpServers,
              model: appliedModelId ?? "",
              runtimeVersion: "",
              skills: [],
              tools: [],
            },
          });
        }
      } catch (error) {
        logAdapterDiagnostic(
          "debug",
          "[AcpAgentAdapter] MCP servers unavailable",
          {
            agentId: payload.session.agentType,
            error: error instanceof Error ? error.message : String(error),
            method: mcpServersRequest.method,
            providerSessionId,
            sessionId: payload.session.id,
          },
        );
      }
    };

    // Pushed catalog changes land here: re-read the authoritative list rather
    // than patching a row from the notification payload, so one debounced
    // request covers status, membership and tool changes alike.
    const scheduleMcpRefresh = () => {
      if (disposed || mcpRefreshTimer) {
        return;
      }
      mcpRefreshTimer = setTimeout(() => {
        mcpRefreshTimer = undefined;
        const providerSessionId = activeProviderSessionId;
        if (disposed || !providerSessionId) {
          return;
        }
        void getConnection()
          .then((connection) =>
            refreshMcpServers(connection, providerSessionId),
          )
          .catch(() => {
            // A connection that never came up has no catalog to read.
          });
      }, MCP_CHANGE_DEBOUNCE_MS);
      mcpRefreshTimer.unref?.();
    };

    const refreshContextUsage = async (
      connection: AcpConnection,
      providerSessionId: string,
    ) => {
      if (!contextUsageRequest || disposed) {
        return;
      }
      try {
        const usage = contextUsageRequest.mapResponse(
          await connection.extRequest(
            contextUsageRequest.method,
            contextUsageRequest.buildParams(providerSessionId),
          ),
        );
        if (usage && !disposed) {
          mapper.applyContextUsage(usage);
        }
      } catch (error) {
        logAdapterDiagnostic(
          "debug",
          "[AcpAgentAdapter] context usage unavailable",
          {
            agentId: payload.session.agentType,
            error: error instanceof Error ? error.message : String(error),
            method: contextUsageRequest.method,
            providerSessionId,
            sessionId: payload.session.id,
          },
        );
      }
    };

    const ensureInitialized = async (
      history: SendAgentMessagePayload["history"],
    ) => {
      if (initialized) {
        return initialized;
      }

      const startup = (async () => {
        const connection = await getConnection();
        const response = await connection.initialize(buildInitializeRequest());
        const capabilities = mapNegotiatedCapabilities(response);
        onEvent({
          type: "capabilities.updated",
          sessionId: payload.session.id,
          capabilities,
        });

        const authMethod = this.selectAuthMethod(
          response.authMethods?.map((method) => method.id) ?? [],
        );
        if (authMethod) {
          await connection.authenticate({ methodId: authMethod });
        }
        if (this.options.afterInitialize) {
          await this.options.afterInitialize(connection);
        }

        const providerSession = await this.openProviderSession({
          capabilities,
          connection,
          history,
          payload,
          suppressUpdates(value) {
            suppressSessionUpdates = value;
          },
        });
        const { providerSessionId } = providerSession;
        let modes = providerSession.modes;
        const requestedModeId = payload.session.collaborationMode;
        if (
          modes &&
          modes.currentModeId !== requestedModeId &&
          modes.availableModes.some((mode) => mode.id === requestedModeId)
        ) {
          await connection.setSessionMode({
            sessionId: providerSessionId,
            modeId: requestedModeId,
          });
          modes = { ...modes, currentModeId: requestedModeId };
        }
        modelState = providerSession.modelState;
        appliedModelId = modelState?.currentModelId ?? null;
        const currentModel = modelState?.models.find(
          (model) => model.modelId === modelState?.currentModelId,
        );
        mapper.initializeSessionState({
          configOptions: providerSession.configOptions,
          modes,
          contextWindowSize: currentModel?.contextWindow ?? null,
        });
        // A restored session carries a context fill the app cannot derive: the
        // stored usage predates whatever the agent recomputed while restoring.
        // A fresh session starts empty, so there is nothing to ask about.
        if (providerSession.sessionAction !== "new") {
          void refreshContextUsage(connection, providerSessionId);
        }
        activeProviderSessionId = providerSessionId;
        payload.onProviderSessionUpdate?.({
          sessionId: payload.session.id,
          providerSessionId,
          providerStateJson: serializeProviderSessionState({
            adapter: "acp",
            protocol: "acp",
            protocolVersion: response.protocolVersion,
          }),
          providerVersion: response.agentInfo?.version ?? null,
          resumable: capabilities.resumeSession || capabilities.loadSession,
          updatedAt: new Date().toISOString(),
        });
        void refreshRateLimits(connection);
        void refreshMcpServers(connection, providerSessionId);
        return { capabilities, connection, providerSessionId };
      })();
      initialized = startup;
      try {
        return await startup;
      } catch (error) {
        if (initialized === startup) {
          initialized = undefined;
          const failedConnection = connectionPromise;
          connectionPromise = undefined;
          void failedConnection
            ?.then((connection) => connection.close())
            .catch(() => {});
        }
        throw error;
      }
    };

    return {
      async sendMessage(messagePayload: SendAgentMessagePayload) {
        const startedAt = Date.now();
        const userMessageId = messagePayload.messageId ?? crypto.randomUUID();
        mapper.beginTurn(userMessageId);
        try {
          const { capabilities, connection, providerSessionId } =
            await ensureInitialized(messagePayload.history);
          if (messagePayload.delivery === "steer-active-run") {
            if (!steeringRequest) {
              throw new Error(
                `${agentLabel} does not support steering active turns`,
              );
            }
            const messageId = userMessageId;
            const prompt = await buildAcpPrompt(
              messagePayload.content,
              messagePayload.attachments ?? [],
              capabilities,
            );
            try {
              await connection.extRequest(
                steeringRequest.method,
                steeringRequest.buildParams({
                  messageId,
                  prompt,
                  providerSessionId,
                }),
              );
            } catch (error) {
              if (error instanceof RequestError && error.code === -32601) {
                throw new AgentSteeringUnavailableError(
                  `${agentLabel} does not support steering active turns`,
                );
              }
              throw error;
            }
            return {
              id: messageId,
              sessionId: payload.session.id,
              role: "user",
              content: messagePayload.content.trim(),
              attachments: messagePayload.attachments ?? [],
              createdAt: new Date().toISOString(),
            } satisfies MessageRecord;
          }
          onEvent({
            type: "state.changed",
            sessionId: payload.session.id,
            status: "running",
          });
          const permissionMode =
            messagePayload.permissionMode ?? payload.session.permissionMode;
          if (
            permissionModeNotification &&
            permissionMode &&
            permissionMode !== appliedPermissionMode
          ) {
            const params =
              permissionModeNotification.buildParams(permissionMode);
            if (params) {
              await connection.extNotification(
                permissionModeNotification.method,
                params,
              );
              appliedPermissionMode = permissionMode;
            }
          }
          const providerSnapshot =
            messagePayload.providerSnapshot === undefined
              ? payload.session.providerSnapshot
              : messagePayload.providerSnapshot;
          const selectedModelId =
            providerSnapshot && providerSnapshot.providerId === modelProviderId
              ? resolveAcpModelId(modelState, providerSnapshot.modelId)
              : null;
          const currentModelId =
            selectedModelId ?? modelState?.currentModelId ?? null;
          const reasoningEffort = resolveAcpReasoningEffort(
            modelState,
            currentModelId,
            messagePayload.thinkingLevel,
          );
          const modelChanged =
            currentModelId !== null && currentModelId !== appliedModelId;
          const reasoningEffortChanged =
            reasoningEffort !== null &&
            reasoningEffort !== appliedReasoningEffort;
          if (currentModelId && (modelChanged || reasoningEffortChanged)) {
            await connection.setSessionModel({
              sessionId: providerSessionId,
              modelId: currentModelId,
              ...(reasoningEffort ? { _meta: { reasoningEffort } } : {}),
            });
            appliedModelId = currentModelId;
            appliedReasoningEffort = reasoningEffort;
          }
          logOutgoingPromptForDiagnostics({
            agentId: payload.session.agentType,
            attachments: messagePayload.attachments ?? [],
            history: messagePayload.history,
            prompt: messagePayload.content,
            sessionId: payload.session.id,
          });
          const response = await connection.prompt({
            sessionId: providerSessionId,
            prompt: await buildAcpPrompt(
              messagePayload.content,
              messagePayload.attachments ?? [],
              capabilities,
            ),
          });
          void refreshRateLimits(connection);
          void refreshMcpServers(connection, providerSessionId);
          const message = mapper.complete(
            response.stopReason,
            Date.now() - startedAt,
            response,
          );
          onEvent({
            type: "state.changed",
            sessionId: payload.session.id,
            status: "idle",
          });
          return message;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "ACP prompt failed";
          onEvent({
            type: "error",
            sessionId: payload.session.id,
            message,
          });
          onEvent({
            type: "state.changed",
            sessionId: payload.session.id,
            status: "error",
          });
          throw error;
        }
      },
      getWorkspaceChangeCapabilities() {
        return {
          turnDiff: "tool-level" as const,
          fileRewind: "none" as const,
          coverage: "tool-call" as const,
          conversationRevert: false,
        };
      },
      async collectNativeWorkspaceChanges() {
        return mapper.collectNativeEvidence();
      },
      async setMode(modeId: string) {
        const { connection, providerSessionId } = await ensureInitialized([]);
        await connection.setSessionMode({
          sessionId: providerSessionId,
          modeId,
        });
        onEvent({
          type: "session.mode.updated",
          sessionId: payload.session.id,
          currentModeId: modeId,
        });
      },
      async setConfigOption(configId: string, value: boolean | string) {
        const { connection, providerSessionId } = await ensureInitialized([]);
        const request =
          typeof value === "boolean"
            ? {
                sessionId: providerSessionId,
                configId,
                type: "boolean" as const,
                value,
              }
            : {
                sessionId: providerSessionId,
                configId,
                value,
              };
        const response = await connection.setSessionConfigOption(request);
        mapper.initializeSessionState({
          configOptions: response.configOptions,
        });
        return mapSessionConfigOptions(response.configOptions);
      },
      async stop() {
        const providerSessionId = activeProviderSessionId;
        if (!providerSessionId) {
          return;
        }
        // Awaited so the notification is on the wire before any caller-side
        // teardown: `session/cancel` is fire-and-forget, and a connection that
        // closes first leaves the agent running the turn it was told to drop.
        const connection = await getConnection();
        try {
          await connection.cancel({
            sessionId: providerSessionId,
            _meta: { cancelTrigger: "client_stop" },
          });
        } catch {
          // A closed transport means the turn is already over; nothing to cancel.
        }
      },
      async dispose() {
        disposed = true;
        clearTimeout(mcpRefreshTimer);
        const connection = connectionPromise;
        try {
          await connection?.then((value) => value.close());
        } catch {
          // A connection that never came up has no process to tear down.
        }
      },
    };
  }

  private selectAuthMethod(available: string[]) {
    for (const method of this.options.authMethodPriority ?? []) {
      if (available.includes(method)) {
        return method;
      }
    }
    return available[0];
  }

  private async openProviderSession({
    capabilities,
    connection,
    history,
    payload,
    suppressUpdates,
  }: {
    capabilities: AgentNegotiatedCapabilities;
    connection: AcpConnection;
    history: SendAgentMessagePayload["history"];
    payload: CreateAgentSessionPayload;
    suppressUpdates(value: boolean): void;
  }) {
    const providerSessionId =
      payload.providerSession?.resumable === false
        ? undefined
        : payload.providerSession?.providerSessionId;
    if (providerSessionId && capabilities.resumeSession) {
      try {
        const response = await connection.resumeSession({
          sessionId: providerSessionId,
          cwd: payload.workspaceRootPath,
          mcpServers: [],
        });
        logAdapterDiagnostic("info", "[AcpAgentAdapter] session opened", {
          agentId: payload.session.agentType,
          providerSessionId,
          sessionAction: "resume",
          sessionId: payload.session.id,
          workspaceRootPath: payload.workspaceRootPath,
        });
        return {
          providerSessionId,
          sessionAction: "resume" as const,
          modes: response.modes,
          configOptions: response.configOptions,
          modelState: readAcpSessionModelState(response),
        };
      } catch (error) {
        logAdapterDiagnostic(
          "info",
          "[AcpAgentAdapter] session resume failed",
          {
            agentId: payload.session.agentType,
            error: error instanceof Error ? error.message : String(error),
            providerSessionId,
            sessionId: payload.session.id,
            workspaceRootPath: payload.workspaceRootPath,
          },
        );
        if (!capabilities.loadSession) {
          throw createNativeSessionRecoveryError(this.options.descriptor.label);
        }
      }
    }

    if (providerSessionId && capabilities.loadSession) {
      suppressUpdates(true);
      try {
        const response = await connection.loadSession({
          sessionId: providerSessionId,
          cwd: payload.workspaceRootPath,
          mcpServers: [],
          // The app transcript is authoritative, so the agent's replay of every
          // past session update would be deserialized, streamed and dropped.
          // Grok Build reads `noReplay` to skip loading those updates entirely.
          _meta: { noReplay: true },
        });
        logAdapterDiagnostic("info", "[AcpAgentAdapter] session opened", {
          agentId: payload.session.agentType,
          providerSessionId,
          sessionAction: "load",
          sessionId: payload.session.id,
          workspaceRootPath: payload.workspaceRootPath,
        });
        return {
          providerSessionId,
          sessionAction: "load" as const,
          modes: response.modes,
          configOptions: response.configOptions,
          modelState: readAcpSessionModelState(response),
        };
      } catch (error) {
        logAdapterDiagnostic("info", "[AcpAgentAdapter] session load failed", {
          agentId: payload.session.agentType,
          error: error instanceof Error ? error.message : String(error),
          providerSessionId,
          sessionId: payload.session.id,
          workspaceRootPath: payload.workspaceRootPath,
        });
        throw createNativeSessionRecoveryError(this.options.descriptor.label);
      } finally {
        suppressUpdates(false);
      }
    }

    if (providerSessionId || requiresNativeSessionRecovery(history)) {
      logAdapterDiagnostic(
        "info",
        "[AcpAgentAdapter] session recovery blocked",
        {
          agentId: payload.session.agentType,
          historyMessageCount: history.length,
          providerSessionId: providerSessionId ?? null,
          sessionId: payload.session.id,
          workspaceRootPath: payload.workspaceRootPath,
        },
      );
      throw createNativeSessionRecoveryError(this.options.descriptor.label);
    }

    const response = await connection.newSession({
      cwd: payload.workspaceRootPath,
      mcpServers: [],
    });
    logAdapterDiagnostic("info", "[AcpAgentAdapter] session opened", {
      agentId: payload.session.agentType,
      providerSessionId: response.sessionId,
      sessionAction: "new",
      sessionId: payload.session.id,
      workspaceRootPath: payload.workspaceRootPath,
    });
    return {
      providerSessionId: response.sessionId,
      sessionAction: "new" as const,
      modes: response.modes,
      configOptions: response.configOptions,
      modelState: readAcpSessionModelState(response),
    };
  }
}
