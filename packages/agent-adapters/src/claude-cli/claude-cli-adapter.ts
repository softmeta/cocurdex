import {
  type Query as ClaudeQuery,
  type Options as ClaudeQueryOptions,
  getSessionInfo as claudeGetSessionInfo,
  query as claudeQuery,
  type GetSessionInfoOptions,
  type SDKMessage,
  type SDKSessionInfo,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentAdapter,
  AgentSession,
  CreateAgentSessionPayload,
  SendAgentMessagePayload,
} from "@cocurdex/agent-core";
import { getAgentDescriptor, lookupExecutable } from "@cocurdex/agent-core";
import type {
  AgentEvent,
  AgentProviderRuntimeSnapshot,
  MessageRecord,
} from "@cocurdex/shared";
import {
  buildClaudeUserContent,
  createClaudeCanUseTool,
  createClaudeMessageMapper,
  getClaudeReasoningEffort,
  getClaudeResultError,
  isAuthenticationFailureText,
} from "../claude-shared";
import { logAdapterDiagnostic } from "../diagnostics";
import {
  logOutgoingPromptForDiagnostics,
  serializeProviderSessionState,
} from "../shared";
import { createNativeSessionTitleTracker } from "../shared/native-session-title";
import {
  createNativeSessionRecoveryError,
  requiresNativeSessionRecovery,
} from "../shared/session-recovery";
import { claudeRewindToEvidence } from "../workspace-changes/native-evidence";
import { discoverClaudeCliCapabilities } from "./claude-cli-capabilities";
import {
  buildClaudeCliEnv,
  getClaudeCliPermissionMode,
} from "./claude-cli-process";
import { mapClaudeContextBreakdown } from "./claude-context-breakdown";
import { resolveClaudeSdkExecutablePath } from "./claude-executable";
import {
  CLAUDE_USAGE_METHOD,
  type ClaudePlanUsageResponse,
  mapClaudePlanUsage,
} from "./claude-plan-usage";
import { ClaudeQueryPromptQueue } from "./claude-query-queue";
import { createClaudeResultAttribution } from "./claude-result-attribution";
import {
  createClaudeProviderRuntimeSnapshot,
  createClaudeRuntimeFingerprint,
  hasSameMcpServerStatuses,
  readClaudeRuntimeFingerprint,
} from "./claude-runtime";
import { readClaudeNativeSessionTitle } from "./claude-session-title";

const descriptor = getAgentDescriptor("claude-agent");
const CLAUDE_PROVIDER_VERSION = "claude-agent-sdk";
const CLAUDE_TITLE_TIMEOUT_MS = 20_000;

const CLAUDE_LOGIN_HINT =
  "Run `claude auth login` in your terminal to authenticate Claude Agent.";
const CLAUDE_INSTALL_HINT =
  "Claude Agent is unavailable. Install Claude Code and run `claude auth login` in your terminal.";

interface ClaudeProviderState {
  adapter?: string;
  resume?: string;
  resumeSessionAt?: string;
  schemaVersion?: number;
  sessionId?: string;
  turnCount?: number;
}

interface ClaudeSessionTitleQuery {
  generateSessionTitle(
    description: string,
    options?: { persist?: boolean },
  ): Promise<string>;
}

interface ClaudeQueryWaiter {
  reject(error: Error): void;
  resolve(query: ClaudeQuery): void;
  signal: AbortSignal;
  abort(): void;
}

interface ClaudeCliAdapterDependencies {
  createQuery?: (input: {
    prompt: AsyncIterable<SDKUserMessage>;
    options: ClaudeQueryOptions;
  }) => ClaudeQuery;
  getSessionInfo?: (
    sessionId: string,
    options?: GetSessionInfoOptions,
  ) => Promise<SDKSessionInfo | undefined>;
  lookupExecutable?: (command: string) => Promise<string | null>;
}

function readProviderState(providerStateJson: string | undefined) {
  if (!providerStateJson) {
    return {};
  }

  try {
    const value = JSON.parse(providerStateJson) as ClaudeProviderState;
    if (!value || typeof value !== "object") {
      return {};
    }

    return {
      runtimeFingerprint: readClaudeRuntimeFingerprint({
        providerStateJson,
      }),
      resumeSessionAt:
        typeof value.resumeSessionAt === "string"
          ? value.resumeSessionAt
          : undefined,
      turnCount:
        typeof value.turnCount === "number" &&
        Number.isInteger(value.turnCount) &&
        value.turnCount >= 0
          ? value.turnCount
          : 0,
    };
  } catch {
    return {};
  }
}

function getModelId(
  payload: CreateAgentSessionPayload,
  messagePayload: SendAgentMessagePayload,
) {
  const providerConfig =
    messagePayload.providerSnapshot ??
    payload.providerConfig ??
    payload.session.providerSnapshot;
  const modelId = providerConfig?.modelId;
  if (!modelId || modelId === "default") {
    return null;
  }

  return modelId;
}

function shouldRefreshContextUsage(message: SDKMessage) {
  if (message.type === "system") {
    return message.subtype === "compact_boundary";
  }

  if (message.type !== "stream_event") {
    return false;
  }

  const event = (message as unknown as { event?: unknown }).event;
  return (
    event !== null &&
    typeof event === "object" &&
    (event as { type?: unknown }).type === "message_delta"
  );
}

function getFastMode(
  payload: CreateAgentSessionPayload,
  messagePayload: SendAgentMessagePayload,
) {
  const providerConfig =
    messagePayload.providerSnapshot ??
    payload.providerConfig ??
    payload.session.providerSnapshot;
  return typeof providerConfig?.fastMode === "boolean"
    ? providerConfig.fastMode
    : null;
}

function formatClaudeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return isAuthenticationFailureText(message)
    ? `${message}\n${CLAUDE_LOGIN_HINT}`
    : message;
}

function readContextTokenCount(value: unknown, allowZero = false) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    (!allowZero && value === 0)
  ) {
    return undefined;
  }

  return Math.floor(value);
}

// Claude Agent SDK owns the Claude Code subprocess and protocol. Cocurdex
// keeps the product transcript in SQLite and only persists the native session
// cursor needed to resume that transcript after the daemon restarts.
export function createClaudeCliAdapter(
  dependencies: ClaudeCliAdapterDependencies = {},
): AgentAdapter {
  const lookupClaudeExecutable =
    dependencies.lookupExecutable ?? lookupExecutable;
  const createQuery =
    dependencies.createQuery ?? ((input) => claudeQuery(input));
  const getSessionInfo = dependencies.getSessionInfo ?? claudeGetSessionInfo;

  return {
    getDescriptor() {
      return descriptor;
    },
    discoverCapabilities({ executablePath }) {
      return discoverClaudeCliCapabilities(executablePath);
    },
    createSession(
      payload: CreateAgentSessionPayload,
      onEvent: (event: AgentEvent) => void,
    ): AgentSession {
      let disposed = false;
      let latestRuntime: AgentProviderRuntimeSnapshot | null = null;
      let query: ClaudeQuery | null = null;
      let providerSessionId =
        payload.providerSession?.providerSessionId ?? null;
      const persistedState = readProviderState(
        payload.providerSession?.providerStateJson,
      );
      let resumeSessionAt = persistedState.resumeSessionAt;
      let turnCount = persistedState.turnCount ?? 0;
      let runtimeFingerprint = persistedState.runtimeFingerprint;
      let lastPersistedProviderStateJson =
        payload.providerSession?.providerStateJson ?? "";
      let activeBinaryPath: string | null = null;
      let activeConfigDir: string | null = null;
      let activePermissionMode: string | null = null;
      let activeModelId: string | null = null;
      let finishActiveTurn: (() => void) | null = null;
      const queryWaiters = new Set<ClaudeQueryWaiter>();
      const promptQueue = new ClaudeQueryPromptQueue();
      const resultAttribution = createClaudeResultAttribution();
      const sessionId = payload.session.id;
      const updateNativeSessionTitle = createNativeSessionTitleTracker({
        initialTitle: payload.providerSession ? null : payload.session.title,
        onEvent,
        sessionId,
      });
      const messageMapper = createClaudeMessageMapper({
        sessionId,
        logLabel: "[ClaudeAgentSdkAdapter]",
        onEvent,
      });

      function settleQueryWaiters(queryToUse: ClaudeQuery) {
        for (const waiter of queryWaiters) {
          waiter.signal.removeEventListener("abort", waiter.abort);
          waiter.resolve(queryToUse);
        }
        queryWaiters.clear();
      }

      function rejectQueryWaiters(error: Error) {
        for (const waiter of queryWaiters) {
          waiter.signal.removeEventListener("abort", waiter.abort);
          waiter.reject(error);
        }
        queryWaiters.clear();
      }

      function waitForQuery(signal: AbortSignal): Promise<ClaudeQuery> {
        if (query) {
          return Promise.resolve(query);
        }

        return new Promise((resolve, reject) => {
          const waiter: ClaudeQueryWaiter = {
            abort() {
              queryWaiters.delete(waiter);
              reject(new Error("Claude title generation timed out"));
            },
            reject,
            resolve,
            signal,
          };
          signal.addEventListener("abort", waiter.abort, { once: true });
          queryWaiters.add(waiter);
          if (query) {
            queryWaiters.delete(waiter);
            signal.removeEventListener("abort", waiter.abort);
            resolve(query);
          }
        });
      }

      function persistProviderCursor() {
        if (!providerSessionId) {
          return;
        }

        const providerStateJson = serializeProviderSessionState({
          adapter: "claude-agent-sdk",
          resume: providerSessionId,
          ...(resumeSessionAt ? { resumeSessionAt } : {}),
          ...(runtimeFingerprint ? { runtimeFingerprint } : {}),
          sessionId: providerSessionId,
          turnCount,
        });
        if (providerStateJson === lastPersistedProviderStateJson) {
          return;
        }

        lastPersistedProviderStateJson = providerStateJson;
        payload.onProviderSessionUpdate?.({
          sessionId,
          providerSessionId,
          providerStateJson,
          providerVersion: CLAUDE_PROVIDER_VERSION,
          resumable: true,
          updatedAt: new Date().toISOString(),
        });
      }

      function updateProviderSessionId(nextProviderSessionId: unknown) {
        if (typeof nextProviderSessionId !== "string") {
          return;
        }

        const normalizedId = nextProviderSessionId.trim();
        if (!normalizedId) {
          return;
        }

        providerSessionId = normalizedId;
        persistProviderCursor();
      }

      function finishTurn() {
        resultAttribution.cancelUserTurn();
        const finish = finishActiveTurn;
        finishActiveTurn = null;
        finish?.();
      }

      function emitTurnError(message: string) {
        onEvent({ type: "error", sessionId, message });
        onEvent({ type: "state.changed", sessionId, status: "error" });
      }

      // Plan quota lives behind an SDK method the SDK itself marks unstable
      // ("may change or be removed in any release"), so it is resolved by name
      // at call time and any failure simply leaves the quota section hidden.
      async function emitPlanUsage(queryToInspect: ClaudeQuery) {
        const getPlanUsage = (
          queryToInspect as unknown as Record<string, unknown>
        )[CLAUDE_USAGE_METHOD];
        if (typeof getPlanUsage !== "function") {
          return;
        }

        try {
          const planUsage = await (
            getPlanUsage as () => Promise<ClaudePlanUsageResponse>
          ).call(queryToInspect);
          const rateLimits = mapClaudePlanUsage(
            planUsage,
            new Date().toISOString(),
          );
          if (rateLimits) {
            onEvent({ type: "rate_limits.updated", sessionId, rateLimits });
          }
        } catch (error) {
          logAdapterDiagnostic(
            "debug",
            "[ClaudeAgentSdkAdapter] plan usage unavailable",
            { error: formatClaudeError(error), sessionId },
          );
        }
      }

      // The init message is the only MCP catalog the SDK pushes, and it is
      // pushed once per query — not per turn. Servers that finish connecting
      // later, drop, or start needing auth never re-announce, so the status is
      // re-read from the control channel at turn end.
      async function emitMcpServerStatus(queryToInspect: ClaudeQuery) {
        const runtime = latestRuntime;
        const getMcpServerStatus = queryToInspect.mcpServerStatus;
        if (!runtime || typeof getMcpServerStatus !== "function") {
          return;
        }

        try {
          const statuses = await getMcpServerStatus.call(queryToInspect);
          const mcpServers = statuses.map(({ name, status }) => ({
            name,
            status,
          }));
          if (hasSameMcpServerStatuses(runtime.mcpServers, mcpServers)) {
            return;
          }
          latestRuntime = { ...runtime, mcpServers };
          onEvent({
            type: "provider.runtime.updated",
            sessionId,
            runtime: latestRuntime,
            receivedAt: new Date().toISOString(),
          });
        } catch (error) {
          logAdapterDiagnostic(
            "debug",
            "[ClaudeAgentSdkAdapter] MCP server status unavailable",
            { error: formatClaudeError(error), sessionId },
          );
        }
      }

      async function emitContextUsage(queryToInspect: ClaudeQuery) {
        const getContextUsage = queryToInspect.getContextUsage;
        if (typeof getContextUsage !== "function") {
          return;
        }

        try {
          const contextUsage = await getContextUsage.call(queryToInspect);
          const contextTokensUsed = readContextTokenCount(
            contextUsage?.totalTokens,
            true,
          );
          const contextWindowSize = readContextTokenCount(
            contextUsage?.maxTokens,
          );

          // The SDK reports the same composition Claude Code's `/context`
          // prints. Forward it alongside the totals so the footer meter can
          // break the window down instead of only sizing it.
          const breakdown = mapClaudeContextBreakdown(
            contextUsage,
            new Date().toISOString(),
          );
          if (breakdown) {
            onEvent({
              type: "context_breakdown.updated",
              sessionId,
              breakdown,
            });
          }

          if (
            contextTokensUsed === undefined &&
            contextWindowSize === undefined
          ) {
            return;
          }

          onEvent({
            type: "usage.updated",
            sessionId,
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              ...(contextTokensUsed !== undefined ? { contextTokensUsed } : {}),
              ...(contextWindowSize !== undefined ? { contextWindowSize } : {}),
            },
            receivedAt: new Date().toISOString(),
          });
        } catch (error) {
          logAdapterDiagnostic(
            "debug",
            "[ClaudeAgentSdkAdapter] context usage unavailable",
            { error: formatClaudeError(error), sessionId },
          );
        }
      }

      async function emitNativeSessionTitle() {
        if (!providerSessionId) {
          return;
        }

        try {
          const info = await getSessionInfo(providerSessionId, {
            dir: payload.workspaceRootPath,
          });
          updateNativeSessionTitle(readClaudeNativeSessionTitle(info));
        } catch (error) {
          logAdapterDiagnostic(
            "debug",
            "[ClaudeAgentSdkAdapter] session title unavailable",
            { error: formatClaudeError(error), sessionId },
          );
        }
      }

      async function handleQueryMessage(
        message: SDKMessage,
        queryToConsume: ClaudeQuery,
      ) {
        updateProviderSessionId(message.session_id);

        if (message.type === "system" && message.subtype === "init") {
          const runtime = createClaudeProviderRuntimeSnapshot(message);
          latestRuntime = runtime;
          onEvent({
            type: "provider.runtime.updated",
            sessionId,
            runtime,
            receivedAt: new Date().toISOString(),
          });
          logAdapterDiagnostic("info", "[ClaudeAgentSdkAdapter] init", {
            ...runtime,
            configDir: activeConfigDir,
            executablePath: activeBinaryPath,
            runtimeFingerprint,
            sessionId,
          });
        }

        if (message.type === "assistant") {
          resumeSessionAt = message.uuid;
          persistProviderCursor();
        }

        const resultError = getClaudeResultError(message);
        if (message.type === "result") {
          const resultRecord = message as unknown as Record<string, unknown>;
          const disposition = resultAttribution.classifyResult({
            isError: Boolean(resultError),
            numTurns:
              typeof resultRecord.num_turns === "number"
                ? resultRecord.num_turns
                : null,
            resultId:
              typeof resultRecord.uuid === "string" ? resultRecord.uuid : null,
          });
          if (disposition.kind !== "user-turn") {
            logAdapterDiagnostic(
              "info",
              "[ClaudeAgentSdkAdapter] ignored terminal result",
              {
                disposition: disposition.kind,
                numTurns:
                  typeof resultRecord.num_turns === "number"
                    ? resultRecord.num_turns
                    : null,
                resultId:
                  typeof resultRecord.uuid === "string"
                    ? resultRecord.uuid
                    : null,
                sessionId,
              },
            );
            if (disposition.kind !== "duplicate") {
              messageMapper.handleMessage(message, {
                resultAttribution: "session-only",
              });
            }
            return;
          }
        }
        messageMapper.handleMessage(message);

        if (message.type === "result" || shouldRefreshContextUsage(message)) {
          await emitContextUsage(queryToConsume);
        }

        // Quota only moves once a turn has been billed, so it rides the result
        // message rather than every streamed usage delta.
        if (message.type === "result") {
          await emitPlanUsage(queryToConsume);
          await emitMcpServerStatus(queryToConsume);
          await emitNativeSessionTitle();
        }

        if (resultError) {
          emitTurnError(formatClaudeError(resultError.message));
          finishTurn();
          return;
        }

        if (message.type === "result") {
          turnCount += 1;
          persistProviderCursor();
          finishTurn();
        }
      }

      async function consumeQuery(queryToConsume: ClaudeQuery) {
        try {
          for await (const message of queryToConsume) {
            if (!disposed) {
              await handleQueryMessage(message, queryToConsume);
            }
          }

          if (!disposed) {
            emitTurnError("Claude Agent SDK query ended unexpectedly");
          }
        } catch (error) {
          if (!disposed) {
            emitTurnError(formatClaudeError(error));
          }
        } finally {
          if (query === queryToConsume) {
            query = null;
          }
          finishTurn();
        }
      }

      async function syncQueryOptions(messagePayload: SendAgentMessagePayload) {
        if (!query) {
          return;
        }

        const permissionMode = getClaudeCliPermissionMode(
          messagePayload.permissionMode === undefined
            ? payload.session.permissionMode
            : (messagePayload.permissionMode ?? undefined),
          messagePayload.collaborationMode ?? payload.session.collaborationMode,
          getModelId(payload, messagePayload),
        );
        const modelId = getModelId(payload, messagePayload);
        if (permissionMode !== activePermissionMode) {
          await query.setPermissionMode(permissionMode);
          activePermissionMode = permissionMode;
        }
        if (modelId !== activeModelId) {
          await query.setModel(modelId ?? undefined);
          activeModelId = modelId;
        }

        const effort = getClaudeReasoningEffort(messagePayload.thinkingLevel);
        const fastMode = getFastMode(payload, messagePayload);
        await query.applyFlagSettings({
          effortLevel: effort ?? null,
          ...(fastMode !== null ? { fastMode } : {}),
        });
      }

      async function ensureQuery(messagePayload: SendAgentMessagePayload) {
        if (query) {
          await syncQueryOptions(messagePayload);
          return true;
        }

        const discoveredPath = await lookupClaudeExecutable("claude");
        if (!discoveredPath) {
          emitTurnError(CLAUDE_INSTALL_HINT);
          return false;
        }

        const binaryPath = resolveClaudeSdkExecutablePath(discoveredPath);
        const claudeEnv = buildClaudeCliEnv();
        const currentRuntimeFingerprint = createClaudeRuntimeFingerprint({
          configDir:
            typeof claudeEnv.CLAUDE_CONFIG_DIR === "string"
              ? claudeEnv.CLAUDE_CONFIG_DIR
              : null,
          executablePath: binaryPath,
          workspaceRootPath: payload.workspaceRootPath,
        });

        const permissionMode = getClaudeCliPermissionMode(
          messagePayload.permissionMode === undefined
            ? payload.session.permissionMode
            : (messagePayload.permissionMode ?? undefined),
          messagePayload.collaborationMode ?? payload.session.collaborationMode,
          getModelId(payload, messagePayload),
        );
        const modelId = getModelId(payload, messagePayload);
        const effort = getClaudeReasoningEffort(messagePayload.thinkingLevel);
        const fastMode = getFastMode(payload, messagePayload);
        const resumable = payload.providerSession?.resumable !== false;
        const resumeSessionId = resumable ? providerSessionId : null;
        const newSessionId = resumeSessionId ? null : crypto.randomUUID();

        if (
          resumeSessionId &&
          runtimeFingerprint &&
          runtimeFingerprint !== currentRuntimeFingerprint
        ) {
          const error = new Error(
            "Claude Agent SDK native session belongs to a different runtime. Start a new session after changing the Claude CLI, config directory, or workspace.",
          );
          logAdapterDiagnostic(
            "info",
            "[ClaudeAgentSdkAdapter] runtime fingerprint mismatch",
            {
              currentRuntimeFingerprint,
              previousRuntimeFingerprint: runtimeFingerprint,
              providerSessionId: resumeSessionId,
              sessionId,
              workspaceRootPath: payload.workspaceRootPath,
            },
          );
          emitTurnError(error.message);
          throw error;
        }

        runtimeFingerprint = currentRuntimeFingerprint;
        activeBinaryPath = binaryPath;
        activeConfigDir =
          typeof claudeEnv.CLAUDE_CONFIG_DIR === "string"
            ? claudeEnv.CLAUDE_CONFIG_DIR
            : null;

        if (newSessionId) {
          providerSessionId = newSessionId;
          resumeSessionAt = undefined;
          turnCount = 0;
          persistProviderCursor();
        }

        const queryOptions: ClaudeQueryOptions = {
          additionalDirectories: [payload.workspaceRootPath],
          allowDangerouslySkipPermissions:
            permissionMode === "bypassPermissions",
          canUseTool: createClaudeCanUseTool(payload),
          cwd: payload.workspaceRootPath,
          enableFileCheckpointing: true,
          env: claudeEnv,
          includePartialMessages: true,
          ...(effort ? { effort } : {}),
          ...(modelId ? { model: modelId } : {}),
          ...(fastMode !== null ? { fastMode } : {}),
          pathToClaudeCodeExecutable: binaryPath,
          permissionMode,
          ...(resumeSessionId ? { resume: resumeSessionId } : {}),
          ...(resumeSessionId && resumeSessionAt ? { resumeSessionAt } : {}),
          ...(newSessionId ? { sessionId: newSessionId } : {}),
          settingSources: ["user", "project", "local"],
          systemPrompt: { preset: "claude_code", type: "preset" },
        };

        logAdapterDiagnostic("info", "[ClaudeAgentSdkAdapter] start query", {
          binaryPath,
          configDir: activeConfigDir,
          effort: effort ?? null,
          modelId,
          permissionMode,
          resumeSessionAt: resumeSessionAt ?? null,
          resumeSessionId,
          sessionAction: resumeSessionId ? "resume" : "new",
          sessionId,
          workspaceRootPath: payload.workspaceRootPath,
          runtimeFingerprint,
        });

        try {
          query = createQuery({
            options: queryOptions,
            prompt: promptQueue,
          });
          settleQueryWaiters(query);
        } catch (error) {
          emitTurnError(formatClaudeError(error));
          return false;
        }

        activePermissionMode = permissionMode;
        activeModelId = modelId;
        void consumeQuery(query);
        return true;
      }

      return {
        async generateTitle(message) {
          const queryForTitle = await waitForQuery(
            AbortSignal.timeout(CLAUDE_TITLE_TIMEOUT_MS),
          );
          await queryForTitle.initializationResult();
          const generateSessionTitle = (
            queryForTitle as unknown as Partial<ClaudeSessionTitleQuery>
          ).generateSessionTitle;
          if (typeof generateSessionTitle !== "function") {
            throw new Error("Claude runtime does not support title generation");
          }
          return generateSessionTitle.call(queryForTitle, message, {
            persist: false,
          });
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

          if (messagePayload.delivery === "steer-active-run") {
            if (!query) {
              throw new Error("Claude Agent SDK has no active query to steer");
            }

            promptQueue.push({
              type: "user",
              message: {
                content: buildClaudeUserContent(
                  messagePayload.content,
                  messagePayload.attachments ?? [],
                ).content,
                role: "user",
              },
              parent_tool_use_id: null,
              priority: "next",
              shouldQuery: true,
              uuid: userMessage.id as SDKUserMessage["uuid"],
            });
            return userMessage;
          }

          const canResumeProviderSession =
            payload.providerSession?.resumable !== false &&
            Boolean(providerSessionId);
          if (
            !canResumeProviderSession &&
            requiresNativeSessionRecovery(messagePayload.history)
          ) {
            const error = createNativeSessionRecoveryError("Claude Agent SDK");
            logAdapterDiagnostic(
              "info",
              "[ClaudeAgentSdkAdapter] session recovery blocked",
              {
                historyMessageCount: messagePayload.history.length,
                providerSessionId: null,
                sessionId,
                workspaceRootPath: payload.workspaceRootPath,
              },
            );
            emitTurnError(error.message);
            throw error;
          }

          messageMapper.reset();
          onEvent({
            type: "state.changed",
            sessionId,
            status: "running",
          });

          const started = await ensureQuery(messagePayload);
          if (!started) {
            return userMessage;
          }

          const prompt = buildClaudeUserContent(
            messagePayload.content,
            messagePayload.attachments ?? [],
          );
          logOutgoingPromptForDiagnostics({
            agentId: "claude-agent",
            attachments: messagePayload.attachments ?? [],
            history: messagePayload.history,
            prompt: prompt.text,
            sessionId,
          });

          const turnCompletion = new Promise<void>((resolve) => {
            finishActiveTurn = resolve;
          });
          resultAttribution.beginUserTurn(userMessage.id);
          promptQueue.push({
            type: "user",
            message: { content: prompt.content, role: "user" },
            parent_tool_use_id: null,
            shouldQuery: true,
            uuid: userMessage.id as SDKUserMessage["uuid"],
          });

          await turnCompletion;
          return userMessage;
        },
        getWorkspaceChangeCapabilities() {
          return {
            turnDiff: "tool-level" as const,
            fileRewind: "none" as const,
            coverage: "provider-file-tools" as const,
            conversationRevert: false,
          };
        },
        async collectNativeWorkspaceChanges(input) {
          if (!query) {
            return null;
          }
          try {
            const result = await query.rewindFiles(input.userMessageId, {
              dryRun: true,
            });
            return claudeRewindToEvidence(result, input.userMessageId);
          } catch {
            return null;
          }
        },
        async rewindNativeWorkspaceChanges(input) {
          if (!query) {
            return { canRewind: false, error: "Claude query is not active" };
          }
          return query.rewindFiles(input.nativeCheckpointRef, {
            dryRun: input.dryRun,
          });
        },
        stop() {
          if (!query) {
            return;
          }

          void query
            .interrupt()
            .catch((error) => {
              if (!disposed) {
                logAdapterDiagnostic(
                  "debug",
                  "[ClaudeAgentSdkAdapter] interrupt failed",
                  { error: formatClaudeError(error), sessionId },
                );
              }
            })
            .finally(() => finishTurn());
        },
        dispose() {
          disposed = true;
          rejectQueryWaiters(new Error("Claude session was disposed"));
          promptQueue.close();
          query?.close();
          finishTurn();
          query = null;
        },
      };
    },
  };
}
