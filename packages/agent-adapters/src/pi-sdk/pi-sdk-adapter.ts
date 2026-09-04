import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  piThinkingLevels,
} from "@cocurdex/shared";
import {
  type ImageContent,
  InMemoryCredentialStore,
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  type PromptOptions,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { logAdapterDiagnostic } from "../diagnostics";
import {
  assertNoDocumentAttachments,
  buildTextWithContextAttachments,
  logOutgoingPromptForDiagnostics,
  readImageAttachmentBase64,
  serializeProviderSessionState,
  splitAttachments,
} from "../shared";
import {
  createNativeSessionRecoveryError,
  requiresNativeSessionRecovery,
} from "../shared/session-recovery";
import {
  emitNativeWorkspaceEvidence,
  extractPiEditSnapshot,
} from "../workspace-changes/native-evidence";
import {
  buildModelCost,
  buildModelInput,
  getNumber,
  parseHeaders,
  parseJsonObject,
} from "./pi-model-utils";
import { getPiAgentDir } from "./pi-paths";
import {
  getPiSkillRootSnapshots,
  logPiSkillDiagnostic,
  resolveAdditionalSkillPaths,
} from "./pi-skill-diagnostics";

const PI_PROVIDER_VERSION = "pi-sdk";

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
  steer(text: string, images?: ImageContent[]): Promise<void>;
  setModel?(model: PiModel): Promise<void>;
  setThinkingLevel?(level: PiThinkingLevel): void;
  abort(): Promise<void>;
  dispose(): void;
  subscribe(listener: (event: Record<string, unknown>) => void): () => void;
  sessionManager?: { getSessionFile(): string | undefined };
};

type PiSdkResult = { session: PiSessionLike };

interface PiSdkDependencies {
  DefaultResourceLoader: typeof DefaultResourceLoader;
  ModelRuntime: typeof ModelRuntime;
  SessionManager: typeof SessionManager;
  createAgentSession(options?: Record<string, unknown>): Promise<PiSdkResult>;
}

interface ResolvePiMcpAdapterOptions {
  cwd?: string;
  moduleUrl?: string;
  resourcesPath?: string;
}

// Directory walk used when createRequire(import.meta.url) fails — i.e. when
// this module is bundled into Electron main (`out/main/main.js`) and the
// package only exists under packages/agent-adapters or a desktop direct dep.
export function findPiMcpAdapterPackageJson(
  startDirs: string[],
): string | null {
  for (const startDir of startDirs) {
    let dir = path.resolve(startDir);
    for (let depth = 0; depth < 12; depth += 1) {
      const candidates = [
        path.join(dir, "node_modules", "pi-mcp-adapter", "package.json"),
        path.join(
          dir,
          "packages",
          "agent-adapters",
          "node_modules",
          "pi-mcp-adapter",
          "package.json",
        ),
      ];
      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          return candidate;
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  }
  return null;
}

function getElectronResourcesPath() {
  return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
}

export function resolvePiMcpAdapterPackageJson(
  options: ResolvePiMcpAdapterOptions = {},
): string {
  const moduleUrl = options.moduleUrl ?? import.meta.url;
  const resourcesPath = options.resourcesPath ?? getElectronResourcesPath();
  if (resourcesPath) {
    const packagedCandidates = [
      path.join(
        resourcesPath,
        "app.asar",
        "node_modules",
        "pi-mcp-adapter",
        "package.json",
      ),
      path.join(
        resourcesPath,
        "app.asar.unpacked",
        "node_modules",
        "pi-mcp-adapter",
        "package.json",
      ),
    ];
    const packagedPackageJson = packagedCandidates.find((candidate) =>
      existsSync(candidate),
    );
    if (packagedPackageJson) {
      return packagedPackageJson;
    }
  }

  try {
    return createRequire(moduleUrl).resolve("pi-mcp-adapter/package.json");
  } catch {
    // The packaged daemon lives outside app.asar, so Node resolution cannot
    // reach dependencies bundled inside the archive.
  }

  const found = findPiMcpAdapterPackageJson([
    path.dirname(fileURLToPath(moduleUrl)),
    options.cwd ?? process.cwd(),
  ]);
  if (found) {
    return found;
  }

  throw new Error(
    'Cannot resolve "pi-mcp-adapter". Ensure it is installed for the desktop app or agent-adapters package.',
  );
}

export function getPiMcpAdapterPath() {
  return path.join(path.dirname(resolvePiMcpAdapterPackageJson()), "index.ts");
}

interface ActiveMessageRecord {
  content: string;
  createdAt: string;
  id: string;
  kind: MessageKind;
}

// List slash commands from disk without booting a full agent session, so the
// composer can offer completions before the first message is sent. Extensions
// are skipped because loading them runs user code and needs the trust flow.
//
// Beyond pi's own `.pi/skills`, we also surface skills from project and global
// `.agents/skills` directories (the cross-tool AGENTS convention).
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
      agentDir,
      error: error instanceof Error ? error.message : String(error),
      home: homedir(),
      roots: getPiSkillRootSnapshots({
        agentDir,
        workspaceRootPath: payload.workspaceRootPath,
      }),
      workspaceRootPath: payload.workspaceRootPath,
    });
    logAdapterDiagnostic("info", "pi: listSlashCommands failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  const skillResult = loader.getSkills();
  logPiSkillDiagnostic("pi.skills.scanned", {
    additionalSkillPaths,
    agentDir,
    diagnostics: skillResult.diagnostics,
    home: homedir(),
    roots: getPiSkillRootSnapshots({
      agentDir,
      workspaceRootPath: payload.workspaceRootPath,
    }),
    skillCount: skillResult.skills.length,
    skillNames: skillResult.skills.map((skill) => skill.name),
    workspaceRootPath: payload.workspaceRootPath,
  });
  logAdapterDiagnostic("info", "pi: listSlashCommands scanned", {
    additionalSkillPaths,
    agentDir,
    cwd: payload.workspaceRootPath,
    home: homedir(),
  });

  const skills: AgentSlashCommand[] = skillResult.skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    invocation: `/skill:${skill.name} `,
    source: "skill",
  }));

  return skills;
}

async function registerRuntimeProvider(
  modelRuntime: ModelRuntime,
  providerConfig: RuntimeProviderConfig,
) {
  const api = providerConfig.api;
  if (!api) {
    return null;
  }

  if (providerConfig.apiKey) {
    await modelRuntime.setRuntimeApiKey(
      providerConfig.providerId,
      providerConfig.apiKey,
    );
  } else {
    await modelRuntime.removeRuntimeApiKey(providerConfig.providerId);
  }

  // ponytail: Pi's ProviderConfigInput has no provider-level compat slot, so
  // provider compat is applied as the model compat fallback.
  const compat =
    parseJsonObject(providerConfig.modelCompatJson) ??
    parseJsonObject(providerConfig.providerCompatJson);

  const resolvedBaseUrl =
    providerConfig.modelBaseUrl || providerConfig.baseUrl || undefined;

  // Endpoint the pi SDK will actually hit. The api-appended path differs per
  // api (openai -> /chat/completions, anthropic -> /v1/messages), so logging
  // the resolved baseUrl here is the fastest way to catch mismatches like a
  // gateway model silently hanging on a wrong path.
  logAdapterDiagnostic("info", "pi: registering provider model", {
    providerId: providerConfig.providerId,
    modelId: providerConfig.modelId,
    api,
    baseUrl: resolvedBaseUrl,
    usedModelBaseUrl: Boolean(providerConfig.modelBaseUrl),
  });

  modelRuntime.registerProvider(providerConfig.providerId, {
    name: providerConfig.providerName,
    baseUrl: providerConfig.baseUrl || undefined,
    apiKey: providerConfig.apiKey || undefined,
    api,
    headers: parseHeaders(providerConfig.headersJson),
    models: [
      {
        id: providerConfig.modelId,
        name: providerConfig.modelName || providerConfig.modelId,
        api,
        // Prefer the per-model endpoint; provider baseUrl is only a fallback.
        // Gateways serve anthropic-messages and openai-completions at different
        // paths, so a flat provider baseUrl would break one of them.
        baseUrl: resolvedBaseUrl,
        reasoning:
          providerConfig.supportsReasoning ??
          Boolean(providerConfig.reasoningEffort),
        thinkingLevelMap: parseJsonObject(
          providerConfig.modelThinkingLevelMapJson,
        ),
        input: buildModelInput(providerConfig.modelCapabilities),
        cost: buildModelCost(providerConfig.modelCostJson),
        contextWindow: providerConfig.modelContextWindow ?? 0,
        maxTokens: providerConfig.modelMaxTokens ?? 0,
        compat,
      },
    ],
  });

  return modelRuntime.getModel(
    providerConfig.providerId,
    providerConfig.modelId,
  );
}

type PiModel = NonNullable<Awaited<ReturnType<typeof registerRuntimeProvider>>>;

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
  options: {
    resolveMcpAdapterPath?: () => string;
    sdk?: PiSdkDependencies;
  } = {},
): AgentAdapter {
  const descriptor = getAgentDescriptor("pi");
  const sdk = options.sdk ?? {
    DefaultResourceLoader,
    ModelRuntime,
    SessionManager,
    createAgentSession,
  };
  const resolveMcpAdapterPath =
    options.resolveMcpAdapterPath ?? getPiMcpAdapterPath;

  return {
    getDescriptor() {
      return descriptor;
    },
    listSlashCommands(payload: ListSlashCommandsPayload) {
      return listPiSlashCommands(payload);
    },
    createSession(
      payload: CreateAgentSessionPayload,
      onEvent: (event: AgentEvent) => void,
    ): AgentSession {
      const sessionId = payload.session.id;
      const persistedSessionFile = (() => {
        try {
          const state = payload.providerSession?.providerStateJson
            ? (JSON.parse(payload.providerSession.providerStateJson) as {
                sessionFile?: unknown;
              })
            : null;
          return typeof state?.sessionFile === "string"
            ? state.sessionFile
            : null;
        } catch {
          return null;
        }
      })();
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
      // Pi reports provider failures (429, quota, auth) on the assistant
      // message via stopReason/errorMessage and still resolves session.prompt().
      // Track the latest failed turn so we can surface it after prompt returns
      // instead of treating an empty turn as success.
      let lastTurnError: string | null = null;

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

      // Pi emits one assistant message per turn; its tool calls execute after
      // that message ends. Completing active messages here closes the current
      // turn's MessageRecords so the next turn streams into fresh ids —
      // otherwise every turn's text would append into a single record and the
      // timeline would lose the text/tool-call interleaving.
      function handleMessageEnd(event: Record<string, unknown>) {
        const message = getRecord(event.message);
        if (getString(message?.role) !== "assistant") return;

        const stopReason = getString(message?.stopReason);
        if (stopReason === "error" || stopReason === "aborted") {
          lastTurnError =
            getString(message?.errorMessage) ??
            (stopReason === "aborted"
              ? "Request aborted"
              : "Model request failed");
          logAdapterDiagnostic("info", "pi: assistant message failed", {
            sessionId,
            stopReason,
            errorMessage: lastTurnError,
          });
        } else {
          // A later successful assistant message clears a prior retry failure.
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
        // High-signal event breadcrumb for silent-failure investigation. Full
        // payloads stay out of default logs; COCURDEX_DIAGNOSTICS=1 enables this.
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
          case "agent_end":
            completeMessages();
            // Do not clear lastTurnError here: Pi may still be retrying inside
            // prompt(). A later successful assistant message_end clears it;
            // a terminal failure keeps it for surface after prompt() resolves.
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
          const modelRuntime = await sdk.ModelRuntime.create({
            credentials: new InMemoryCredentialStore(),
            modelsPath: null,
            refreshOnCreate: false,
          });
          const model = await registerRuntimeProvider(
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
            additionalExtensionPaths: [resolveMcpAdapterPath()],
            additionalSkillPaths: resolveAdditionalSkillPaths(
              payload.workspaceRootPath,
            ),
          });
          await resourceLoader.reload();
          const result = await sdk.createAgentSession({
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
          const state = getProviderState(piSession);
          logAdapterDiagnostic("info", "[PiSdkAdapter] session opened", {
            providerSessionId: state.providerSessionId,
            sessionAction,
            sessionFile: persistedSessionFile,
            sessionId,
            workspaceRootPath: payload.workspaceRootPath,
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

        const nextModel = await registerRuntimeProvider(
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
                  workspaceRootPath: payload.workspaceRootPath,
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
            // Provider errors are delivered as assistant stopReason, not throws.
            // Surface them as Cocurdex error events so the UI and agent-runtime
            // logs (agent.eventEmitted with type=error) both record the failure.
            if (lastTurnError) {
              const errorMessage = lastTurnError;
              lastTurnError = null;
              logAdapterDiagnostic("info", "pi: turn failed", {
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
            // emitError only surfaces the message; log the full shape so opaque
            // failures (network, wrong endpoint, empty stream) are debuggable.
            logAdapterDiagnostic("info", "pi: turn failed", {
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
          // Abort the turn only — the session stays alive for the next prompt.
          void piSession?.abort();
        },
        dispose() {
          disposed = true;
          unsubscribe?.();
          unsubscribe = null;
          piSession?.dispose();
        },
      };
    },
  };
}
