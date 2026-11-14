import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  AgentAdapter,
  AgentSession,
  CreateAgentSessionPayload,
  ListSlashCommandsPayload,
  RuntimeProviderConfig,
  SendAgentMessagePayload,
} from "@cocurdex/agent-core";
import { getAgentDescriptor } from "@cocurdex/agent-core";
import type {
  AgentEvent,
  AgentSlashCommand,
  AgentToolCallRecord,
  AgentUsageRecord,
  ImageAttachment,
  MessageRecord,
  PiThinkingLevel,
} from "@cocurdex/shared";
import {
  aggregateTurnFileChanges,
  createUnifiedDiff,
  errorKindForLog,
  hashLogValue,
  piThinkingLevels,
  runsOnDurablePi,
} from "@cocurdex/shared";
import type { ImageContent } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createCodemodeExtension,
  createMcpExtension,
  createToolSearchExtension,
  DefaultResourceLoader,
  getAgentDir,
  type InlineExtension,
  ModelRuntime,
  type PromptOptions,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { loadMcpConfig } from "@earendil-works/pi-coding-agent/mcp-config";
import { logAdapterDiagnostic } from "../diagnostics";
import {
  forkDurableProviderSession,
  readDurableConversation,
} from "../pi-durable/durable-conversations";
import { createDurablePiSession } from "../pi-durable/durable-session";
import {
  assertNoDocumentAttachments,
  buildTextWithContextAttachments,
  logOutgoingPromptForDiagnostics,
  readImageAttachmentBase64,
  serializeProviderSessionState,
  splitAttachments,
} from "../shared";
import { createContextCompactionTracker } from "../shared/context-compaction-tracker";
import {
  createNativeSessionRecoveryError,
  requiresNativeSessionRecovery,
} from "../shared/session-recovery";
import {
  emitNativeWorkspaceEvidence,
  extractPiEditSnapshot,
} from "../workspace-changes/native-evidence";
import { createPiAgentToolDefinitions } from "./pi-agent-tools";
import { handlePiCompactionEvent } from "./pi-compaction";
import { onlyPiMcpServers } from "./pi-mcp-agents";
import {
  createPiModelRuntime,
  resolvePiRuntimeModel,
} from "./pi-model-runtime";
import { getNumber } from "./pi-model-utils";
import { getPiAgentDir } from "./pi-paths";
import { forkPiProviderSession, readPiSessionFile } from "./pi-session-fork";
import {
  getPiSkillRootSnapshots,
  logPiSkillDiagnostic,
  resolveAdditionalSkillPaths,
} from "./pi-skill-diagnostics";
import { renderPiWorkspaceRootsPrompt } from "./pi-workspace-roots";

const PI_PROVIDER_VERSION = "pi-sdk";

function createPiBuiltinExtensions(): InlineExtension[] {
  return [
    { name: "codemode", factory: createCodemodeExtension(), builtin: true },
    {
      name: "tool-search",
      factory: createToolSearchExtension(),
      builtin: true,
    },
    {
      name: "mcp",
      factory: createMcpExtension({
        loadConfig: (ctx) =>
          onlyPiMcpServers(
            loadMcpConfig({
              agentDir: getAgentDir(),
              cwd: ctx.cwd,
              projectTrusted: ctx.isProjectTrusted(),
            }),
          ),
      }),
      builtin: true,
    },
  ];
}

function isPiThinkingLevel(
  value: SendAgentMessagePayload["thinkingLevel"],
): value is PiThinkingLevel {
  return piThinkingLevels.includes(value as PiThinkingLevel);
}

function getPiModelKey(providerConfig: RuntimeProviderConfig) {
  return `${providerConfig.providerId}\u0000${providerConfig.modelId}`;
}

type MessageKind = NonNullable<MessageRecord["kind"]>;

type PiSessionLike = {
  sessionFile?: string;
  sessionId: string;
  prompt(text: string, options?: PromptOptions): Promise<void>;
  steer(text: string, images?: ImageContent[]): Promise<unknown>;
  setModel?(model: PiModel): Promise<void>;
  setThinkingLevel?(level: PiThinkingLevel): void;
  abort(): Promise<void>;
  dispose(): void;
  subscribe(listener: (event: Record<string, unknown>) => void): () => void;
  bindExtensions(bindings: {
    onError?: (error: { extensionPath: string; error: string }) => void;
  }): Promise<void>;
  extensionRunner: {
    emit(event: { type: "session_shutdown"; reason: "quit" }): Promise<unknown>;
  };
  sessionManager?: {
    getSessionFile(): string | undefined;
  };
};

async function shutdownPiSession(session: PiSessionLike) {
  try {
    await session.extensionRunner.emit({
      type: "session_shutdown",
      reason: "quit",
    });
  } catch (error) {
    logAdapterDiagnostic("info", "[PiSdkAdapter] session shutdown failed", {
      errorKind: errorKindForLog(error),
    });
  } finally {
    session.dispose();
  }
}

type PiSdkResult = { session: PiSessionLike };

interface PiSdkDependencies {
  DefaultResourceLoader: typeof DefaultResourceLoader;
  ModelRuntime: typeof ModelRuntime;
  SessionManager: typeof SessionManager;
  createAgentSession(options?: Record<string, unknown>): Promise<PiSdkResult>;
}

interface ActiveMessageRecord {
  content: string;
  createdAt: string;
  id: string;
  kind: MessageKind;
}

async function listPiSlashCommands(
  payload: ListSlashCommandsPayload,
): Promise<AgentSlashCommand[]> {
  const additionalSkillPaths = resolveAdditionalSkillPaths(
    payload.workspaceRootPath,
  );

  const agentDir = getPiAgentDir(payload.userDataPath);
  const loader = new DefaultResourceLoader({
    cwd: payload.workspaceRootPath,
    agentDir,
    additionalSkillPaths,
    noExtensions: true,
  });

  try {
    await loader.reload();
  } catch (error) {
    logPiSkillDiagnostic("pi.skills.reloadFailed", {
      agentDirHash: hashLogValue(agentDir),
      error: error instanceof Error ? error.message : String(error),
      roots: getPiSkillRootSnapshots({
        agentDir,
        workspaceRootPath: payload.workspaceRootPath,
      }),
      workspaceHash: hashLogValue(payload.workspaceRootPath),
    });
    logAdapterDiagnostic("info", "pi: listSlashCommands failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  const skillResult = loader.getSkills();
  logPiSkillDiagnostic("pi.skills.scanned", {
    agentDirHash: hashLogValue(agentDir),
    roots: getPiSkillRootSnapshots({
      agentDir,
      workspaceRootPath: payload.workspaceRootPath,
    }),
    skillCount: skillResult.skills.length,
    workspaceHash: hashLogValue(payload.workspaceRootPath),
  });
  logAdapterDiagnostic("info", "pi: listSlashCommands scanned", {
    agentDirHash: hashLogValue(agentDir),
    workspaceHash: hashLogValue(payload.workspaceRootPath),
  });

  const skills: AgentSlashCommand[] = skillResult.skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    invocation: `/skill:${skill.name} `,
    source: "skill",
  }));

  return skills;
}

type PiModel = NonNullable<Awaited<ReturnType<typeof resolvePiRuntimeModel>>>;

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mapPiUsage(value: unknown): AgentUsageRecord | null {
  const usage = getRecord(value);
  if (!usage) {
    return null;
  }

  const cost = getRecord(usage.cost);
  return {
    inputTokens: getNumber(usage.input) ?? 0,
    outputTokens: getNumber(usage.output) ?? 0,
    cacheCreationInputTokens: getNumber(usage.cacheWrite) ?? 0,
    cacheReadInputTokens: getNumber(usage.cacheRead) ?? 0,
    contextTokensUsed: getNumber(usage.totalTokens) ?? undefined,
    totalCostUsd: getNumber(cost?.total) ?? undefined,
  };
}

function piImagesFromAttachments(
  attachments: ImageAttachment[],
): ImageContent[] {
  return attachments.map(
    (attachment): ImageContent => ({
      type: "image",
      data: readImageAttachmentBase64(attachment),
      mimeType: attachment.mimeType,
    }),
  );
}

function getProviderState(session: PiSessionLike) {
  const sessionFile =
    session.sessionFile ?? session.sessionManager?.getSessionFile();
  return {
    providerSessionId: session.sessionId,
    providerStateJson: serializeProviderSessionState({
      adapter: "pi",
      sessionFile,
    }),
  };
}

export function createPiSdkAdapter(
  options: { sdk?: PiSdkDependencies } = {},
): AgentAdapter {
  const descriptor = getAgentDescriptor("pi");
  const sdk = options.sdk ?? {
    DefaultResourceLoader,
    ModelRuntime,
    SessionManager,
    createAgentSession,
  };

  return {
    getDescriptor() {
      return descriptor;
    },
    runsInProcess: true,
    listSlashCommands(payload: ListSlashCommandsPayload) {
      return listPiSlashCommands(payload);
    },
    async forkProviderSession(payload) {
      const durable = readDurableConversation(payload.source.providerStateJson);
      if (durable) return forkDurableProviderSession(payload, durable);
      return forkPiProviderSession(
        payload,
        sdk.SessionManager,
        PI_PROVIDER_VERSION,
      );
    },
    createSession(
      payload: CreateAgentSessionPayload,
      onEvent: (event: AgentEvent) => void,
    ): AgentSession {
      if (runsOnDurablePi(payload.session)) {
        return createDurablePiSession(payload, onEvent);
      }
      const sessionId = payload.session.id;
      const persistedSessionFile = payload.providerSession?.providerStateJson
        ? readPiSessionFile(payload.providerSession.providerStateJson)
        : null;
      let disposed = false;
      let piSessionPromise: Promise<PiSessionLike> | null = null;
      let piSession: PiSessionLike | null = null;
      let piModelRuntime: ModelRuntime | null = null;
      let activePiModelKey: string | null = null;
      let unsubscribe: (() => void) | null = null;
      let pendingThinkingLevel: PiThinkingLevel | undefined;
      const activeMessages = new Map<string, ActiveMessageRecord>();
      const activeToolCalls = new Map<string, AgentToolCallRecord>();
      const nativeFiles = new Map<
        string,
        NonNullable<ReturnType<typeof extractPiEditSnapshot>>["file"]
      >();
      const nativeSnapshots = new Map<
        string,
        { beforeText: string; afterText: string }
      >();
      let lastUserMessageId: string | null = null;
      let completedMessage: MessageRecord | null = null;
      let responseMessageId = "";
      let lastTurnError: string | null = null;
      let stopRequested = false;
      const compaction = createContextCompactionTracker({
        sessionId,
        emit: onEvent,
      });

      function emitError(message: string) {
        if (disposed) return;
        onEvent({ type: "error", sessionId, message });
        onEvent({ type: "state.changed", sessionId, status: "error" });
      }

      function getMessageKey(kind: MessageKind, contentIndex: number) {
        return `${kind}:${contentIndex}`;
      }

      function emitDelta(kind: MessageKind, delta: string, contentIndex = 0) {
        if (!delta || disposed) return;
        const key = getMessageKey(kind, contentIndex);
        let activeMessage = activeMessages.get(key);
        if (!activeMessage) {
          activeMessage = {
            id: randomUUID(),
            kind,
            content: "",
            createdAt: new Date().toISOString(),
          };
          activeMessages.set(key, activeMessage);
          if (kind === "response" && !responseMessageId) {
            responseMessageId = activeMessage.id;
          }
        }

        activeMessage.content += delta;
        onEvent({
          type: "message.delta",
          sessionId,
          messageId: activeMessage.id,
          role: "assistant",
          kind,
          delta,
          createdAt: new Date().toISOString(),
        });
      }

      function completeMessage(key: string) {
        const activeMessage = activeMessages.get(key);
        if (!activeMessage?.content.trim()) {
          activeMessages.delete(key);
          return null;
        }

        const message: MessageRecord = {
          id: activeMessage.id,
          sessionId,
          role: "assistant",
          kind: activeMessage.kind,
          content: activeMessage.content,
          attachments: [],
          createdAt: activeMessage.createdAt,
        };
        activeMessages.delete(key);
        onEvent({ type: "message.completed", sessionId, message });
        if (message.kind === "response") {
          completedMessage = message;
        }
        return message;
      }

      function completeMessages() {
        return (
          [...activeMessages.keys()]
            .map(completeMessage)
            .find((message) => message?.kind === "response") ??
          completedMessage ??
          null
        );
      }

      function finalizeMessage() {
        return (
          completeMessages() ?? {
            id: responseMessageId || randomUUID(),
            sessionId,
            role: "assistant" as const,
            kind: "response" as const,
            content: "",
            attachments: [],
            createdAt: new Date().toISOString(),
          }
        );
      }

      function getExistingToolCall(
        id: string,
        fallbackTitle: string,
        now: string,
      ): AgentToolCallRecord {
        return (
          activeToolCalls.get(id) ?? {
            id,
            sessionId,
            title: fallbackTitle,
            kind: fallbackTitle.toLowerCase(),
            status: "pending",
            content: [],
            rawInput: null,
            rawOutput: null,
            locations: [],
            startedAt: now,
            updatedAt: now,
          }
        );
      }

      function emitToolCall(toolCall: AgentToolCallRecord) {
        activeToolCalls.set(toolCall.id, toolCall);
        onEvent({
          type:
            toolCall.status === "completed" || toolCall.status === "failed"
              ? "tool.finished"
              : "tool.started",
          sessionId,
          toolCall,
        });
      }

      function handleToolExecutionStart(message: Record<string, unknown>) {
        const id = getString(message.toolCallId) ?? randomUUID();
        const title = getString(message.toolName) ?? "Unknown";
        const now = new Date().toISOString();
        emitToolCall({
          ...getExistingToolCall(id, title, now),
          title,
          kind: title.toLowerCase(),
          status: "in_progress",
          rawInput: message.args ?? null,
          updatedAt: now,
        });
      }

      function handleToolExecutionUpdate(message: Record<string, unknown>) {
        const id = getString(message.toolCallId);
        if (!id) return;
        const title = getString(message.toolName) ?? "Unknown";
        const now = new Date().toISOString();
        emitToolCall({
          ...getExistingToolCall(id, title, now),
          title,
          kind: title.toLowerCase(),
          status: "in_progress",
          rawInput: message.args ?? null,
          rawOutput: message.partialResult ?? null,
          updatedAt: now,
        });
      }

      function handleToolExecutionEnd(message: Record<string, unknown>) {
        const id = getString(message.toolCallId);
        if (!id) return;
        const title = getString(message.toolName) ?? "Unknown";
        const now = new Date().toISOString();
        emitToolCall({
          ...getExistingToolCall(id, title, now),
          title,
          kind: title.toLowerCase(),
          status: message.isError === true ? "failed" : "completed",
          rawOutput: message.result ?? null,
          updatedAt: now,
        });
        const snapshot = extractPiEditSnapshot(message.result);
        if (snapshot) {
          const existing = nativeFiles.get(snapshot.file.path);
          let nextFile = existing
            ? (aggregateTurnFileChanges([existing, snapshot.file])[0] ??
              snapshot.file)
            : snapshot.file;
          if (snapshot.beforeText != null && snapshot.afterText != null) {
            const prior = nativeSnapshots.get(snapshot.file.path);
            const beforeText = prior?.beforeText ?? snapshot.beforeText;
            const afterText = snapshot.afterText;
            nativeSnapshots.set(snapshot.file.path, { beforeText, afterText });
            const created = createUnifiedDiff(
              snapshot.file.path,
              beforeText,
              afterText,
            );
            nextFile = {
              ...nextFile,
              additions: created.additions,
              deletions: created.deletions,
              patch: created.patch,
            };
          }
          nativeFiles.set(snapshot.file.path, nextFile);
          emitNativeWorkspaceEvidence(onEvent, sessionId, lastUserMessageId, {
            source: "pi-tool-patch",
            coverage: "tool-call",
            files: aggregateTurnFileChanges([...nativeFiles.values()]),
          });
        }
      }

      function handleMessageUpdate(message: Record<string, unknown>) {
        const assistantEvent = message.assistantMessageEvent as
          | Record<string, unknown>
          | undefined;
        if (!assistantEvent) return;

        if (assistantEvent.type === "text_delta") {
          emitDelta(
            "response",
            getString(assistantEvent.delta) ?? "",
            getNumber(assistantEvent.contentIndex) ?? 0,
          );
        }
        if (assistantEvent.type === "thinking_delta") {
          emitDelta(
            "reasoning",
            getString(assistantEvent.delta) ?? "",
            getNumber(assistantEvent.contentIndex) ?? 0,
          );
        }
      }

      function handleMessageEnd(event: Record<string, unknown>) {
        const message = getRecord(event.message);
        if (getString(message?.role) !== "assistant") return;

        const stopReason = getString(message?.stopReason);
        if (stopReason === "aborted" && stopRequested) {
          lastTurnError = null;
          logAdapterDiagnostic("info", "pi: assistant message stopped", {
            sessionId,
            messageId: lastUserMessageId,
          });
        } else if (stopReason === "error" || stopReason === "aborted") {
          lastTurnError =
            getString(message?.errorMessage) ??
            (stopReason === "aborted"
              ? "Request aborted"
              : "Model request failed");
          logAdapterDiagnostic("info", "pi: assistant message failed", {
            sessionId,
            messageId: lastUserMessageId,
            stopReason,
            errorKind: errorKindForLog(lastTurnError),
            errorMessage: lastTurnError,
          });
        } else {
          lastTurnError = null;
        }

        const usage = mapPiUsage(message?.usage);
        if (usage) {
          onEvent({
            type: "usage.updated",
            sessionId,
            usage,
            receivedAt: new Date().toISOString(),
          });
        }
        completeMessages();
      }

      function handlePiEvent(event: Record<string, unknown>) {
        const eventType = getString(event.type) ?? "unknown";
        if (
          eventType === "message_end" ||
          eventType === "agent_end" ||
          eventType === "extension_error" ||
          eventType === "auto_retry_end" ||
          eventType === "auto_retry_start"
        ) {
          const message = getRecord(event.message);
          logAdapterDiagnostic("debug", "pi: event", {
            sessionId,
            type: eventType,
            stopReason: message ? getString(message.stopReason) : undefined,
            errorMessage: message
              ? getString(message.errorMessage)
              : (getString(event.errorMessage) ?? getString(event.finalError)),
            willRetry: event.willRetry,
            success: event.success,
          });
        }

        switch (event.type) {
          case "message_update":
            handleMessageUpdate(event);
            break;
          case "message_end":
            handleMessageEnd(event);
            break;
          case "tool_execution_start":
            handleToolExecutionStart(event);
            break;
          case "tool_execution_update":
            handleToolExecutionUpdate(event);
            break;
          case "tool_execution_end":
            handleToolExecutionEnd(event);
            break;
          case "compaction_start":
          case "compaction_end":
            handlePiCompactionEvent(compaction, event);
            break;
          case "agent_end":
            completeMessages();
            if (piSession) {
              const state = getProviderState(piSession);
              payload.onProviderSessionUpdate?.({
                sessionId,
                providerSessionId: state.providerSessionId,
                providerStateJson: state.providerStateJson,
                providerVersion: PI_PROVIDER_VERSION,
                resumable: true,
                updatedAt: new Date().toISOString(),
              });
            }
            break;
          case "auto_retry_end":
            if (event.success === false) {
              lastTurnError =
                getString(event.finalError) ??
                lastTurnError ??
                "Model request failed after retries";
              logAdapterDiagnostic("info", "pi: auto retry exhausted", {
                sessionId,
                messageId: lastUserMessageId,
                errorKind: errorKindForLog(lastTurnError),
                finalError: lastTurnError,
                attempt: event.attempt,
              });
            }
            break;
          case "extension_error":
            emitError(getString(event.error) ?? "Pi extension failed");
            break;
        }
      }

      async function getPiSession() {
        if (piSessionPromise) {
          return piSessionPromise;
        }

        piSessionPromise = (async () => {
          const providerConfig = payload.providerConfig;
          if (!providerConfig) {
            throw new Error("Pi requires a configured provider and model");
          }

          const agentDir = getPiAgentDir(payload.userDataPath);
          process.env.PI_CODING_AGENT_DIR = agentDir;
          const modelRuntime = await createPiModelRuntime(
            payload.userDataPath,
            {
              refresh: "cache",
              providers: [providerConfig.providerId],
              ModelRuntime: sdk.ModelRuntime,
            },
          );
          const model = await resolvePiRuntimeModel(
            modelRuntime,
            providerConfig,
          );
          if (!model) {
            throw new Error(
              `Pi does not support provider api: ${providerConfig.api}`,
            );
          }
          piModelRuntime = modelRuntime;
          activePiModelKey = getPiModelKey(providerConfig);

          const sessionManager = persistedSessionFile
            ? sdk.SessionManager.open(
                persistedSessionFile,
                path.join(agentDir, "sessions"),
                payload.workspaceRootPath,
              )
            : sdk.SessionManager.create(
                payload.workspaceRootPath,
                path.join(agentDir, "sessions"),
              );
          const sessionAction = persistedSessionFile ? "resume" : "new";
          const resourceLoader = new sdk.DefaultResourceLoader({
            cwd: payload.workspaceRootPath,
            agentDir,
            additionalSkillPaths: resolveAdditionalSkillPaths(
              payload.workspaceRootPath,
            ),
            extensionFactories: createPiBuiltinExtensions(),
            appendSystemPromptOverride: (base) => {
              const rootsPrompt = renderPiWorkspaceRootsPrompt(
                payload.workspaceRootPath,
                payload.workspaceRootPaths,
              );
              return rootsPrompt ? [...base, rootsPrompt] : base;
            },
          });
          await resourceLoader.reload();
          const result = await sdk.createAgentSession({
            customTools: await createPiAgentToolDefinitions(
              payload.agentToolInvoker,
            ),
            cwd: payload.workspaceRootPath,
            agentDir,
            modelRuntime,
            model,
            resourceLoader,
            sessionManager,
            thinkingLevel: pendingThinkingLevel,
          });
          piSession = result.session;
          unsubscribe = piSession.subscribe(handlePiEvent);
          await piSession.bindExtensions({
            onError: ({ extensionPath, error }) =>
              logAdapterDiagnostic("info", "[PiSdkAdapter] extension error", {
                errorKind: errorKindForLog(error),
                extensionPathHash: hashLogValue(extensionPath),
              }),
          });
          const state = getProviderState(piSession);
          logAdapterDiagnostic("info", "[PiSdkAdapter] session opened", {
            providerSessionId: state.providerSessionId,
            sessionAction,
            sessionFileHash: hashLogValue(persistedSessionFile),
            sessionId,
            workspaceHash: hashLogValue(payload.workspaceRootPath),
          });
          payload.onProviderSessionUpdate?.({
            sessionId,
            providerSessionId: state.providerSessionId,
            providerStateJson: state.providerStateJson,
            providerVersion: PI_PROVIDER_VERSION,
            resumable: true,
            updatedAt: new Date().toISOString(),
          });
          return piSession;
        })();

        return piSessionPromise;
      }

      async function applyPiModelSelection(
        session: PiSessionLike,
        providerConfig: RuntimeProviderConfig | null | undefined,
      ) {
        if (!providerConfig) {
          return;
        }

        const nextModelKey = getPiModelKey(providerConfig);
        if (!piModelRuntime) {
          throw new Error(
            "Pi cannot change models without rebuilding the active session",
          );
        }

        const nextModel = await resolvePiRuntimeModel(
          piModelRuntime,
          providerConfig,
        );
        if (!nextModel) {
          throw new Error(
            `Pi does not support provider api: ${providerConfig.api}`,
          );
        }

        if (nextModelKey !== activePiModelKey) {
          if (!session.setModel) {
            throw new Error(
              "Pi cannot change models without rebuilding the active session",
            );
          }
          await session.setModel(nextModel);
        }
        activePiModelKey = nextModelKey;
      }

      return {
        async sendMessage(messagePayload: SendAgentMessagePayload) {
          if (disposed) {
            return finalizeMessage();
          }

          const acceptedInputMessage: MessageRecord = {
            id: messagePayload.messageId ?? randomUUID(),
            sessionId,
            role: "user",
            content: messagePayload.content.trim(),
            attachments: messagePayload.attachments ?? [],
            createdAt: new Date().toISOString(),
          };
          lastUserMessageId = acceptedInputMessage.id;
          if (messagePayload.delivery !== "steer-active-run") {
            stopRequested = false;
          }
          nativeFiles.clear();
          nativeSnapshots.clear();
          onEvent({ type: "state.changed", sessionId, status: "running" });
          try {
            if (
              !piSessionPromise &&
              !persistedSessionFile &&
              requiresNativeSessionRecovery(messagePayload.history)
            ) {
              logAdapterDiagnostic(
                "info",
                "[PiSdkAdapter] session recovery blocked",
                {
                  historyMessageCount: messagePayload.history.length,
                  providerSessionId:
                    payload.providerSession?.providerSessionId ?? null,
                  sessionId,
                  workspaceHash: hashLogValue(payload.workspaceRootPath),
                },
              );
              throw createNativeSessionRecoveryError("Pi");
            }
            const thinkingLevel = isPiThinkingLevel(
              messagePayload.thinkingLevel,
            )
              ? messagePayload.thinkingLevel
              : undefined;
            pendingThinkingLevel = thinkingLevel;
            const session = await getPiSession();
            await applyPiModelSelection(session, messagePayload.providerConfig);
            if (thinkingLevel) {
              session.setThinkingLevel?.(thinkingLevel);
            }
            const attachments = messagePayload.attachments ?? [];
            assertNoDocumentAttachments("Pi", attachments);
            const { images } = splitAttachments(attachments);
            const prompt = buildTextWithContextAttachments(
              messagePayload.content,
              attachments,
              { includeImageSummaries: false },
            );
            logOutgoingPromptForDiagnostics({
              agentId: "pi",
              attachments,
              history: messagePayload.history,
              prompt,
              sessionId,
            });
            if (messagePayload.delivery === "steer-active-run") {
              if (images.length > 0) {
                await session.steer(prompt, piImagesFromAttachments(images));
              } else {
                await session.steer(prompt);
              }
              return acceptedInputMessage;
            }
            await session.prompt(
              prompt,
              images.length > 0
                ? { images: piImagesFromAttachments(images) }
                : undefined,
            );
            const message = finalizeMessage();
            if (lastTurnError) {
              const errorMessage = lastTurnError;
              lastTurnError = null;
              logAdapterDiagnostic("info", "pi: turn failed", {
                sessionId,
                messageId: lastUserMessageId,
                errorKind: errorKindForLog(errorMessage),
                message: errorMessage,
                via: "stopReason",
              });
              emitError(errorMessage);
              return message;
            }
            onEvent({ type: "state.changed", sessionId, status: "idle" });
            return message;
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Pi SDK turn failed";
            lastTurnError = null;
            logAdapterDiagnostic("info", "pi: turn failed", {
              sessionId,
              messageId: lastUserMessageId,
              errorKind: errorKindForLog(error),
              message,
              name: error instanceof Error ? error.name : undefined,
              cause: error instanceof Error ? error.cause : undefined,
              stack: error instanceof Error ? error.stack : undefined,
              via: "throw",
            });
            emitError(message);
            return finalizeMessage();
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
          if (nativeFiles.size === 0) {
            return null;
          }
          return {
            source: "pi-tool-patch" as const,
            coverage: "tool-call" as const,
            files: aggregateTurnFileChanges([...nativeFiles.values()]),
          };
        },
        stop() {
          stopRequested = true;
          void piSession?.abort();
        },
        dispose() {
          disposed = true;
          unsubscribe?.();
          unsubscribe = null;
          if (piSession) void shutdownPiSession(piSession);
        },
      };
    },
  };
}
