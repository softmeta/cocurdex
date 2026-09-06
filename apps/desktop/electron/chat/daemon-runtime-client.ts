import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  type DaemonEventSubscription,
  requestDaemon,
  subscribeDaemonEvents,
} from "@cocurdex/daemon/client";
import { DAEMON_PROTOCOL_VERSION } from "@cocurdex/rpc";
import type {
  AgentId,
  AgentPermissionDecision,
  AgentPlanApprovalDecision,
  AgentRuntimeProviderConfig,
  AgentSessionConfigOption,
  AgentSlashCommand,
  CocurdexDaemonEvent,
  CreateSessionPayload,
  MessageRecord,
  SendSessionMessagePayload,
  TurnChangeFileContent,
  TurnChangeFileContentRequest,
  UndoTurnChangesInput,
  UndoTurnChangesResult,
} from "@cocurdex/shared";
import {
  type DaemonDiagnosticSource,
  type OwnedDaemonProcess,
  spawnOwnedDaemonProcess,
} from "./owned-daemon-process";

const START_ATTEMPTS = 50;
const START_RETRY_DELAY_MS = 100;
const RECONNECT_DELAY_MS = 500;

interface DaemonRuntimeLogger {
  debug(event: string, details?: Record<string, unknown>): void;
  error(event: string, details?: Record<string, unknown>): void;
  info(event: string, details?: Record<string, unknown>): void;
  warn(event: string, details?: Record<string, unknown>): void;
}

interface DaemonRuntimeClientOptions {
  daemonEntryPath: string;
  logger: DaemonRuntimeLogger;
  onEvent(event: CocurdexDaemonEvent): void;
  onConnected?(): void;
  userDataPath: string;
}

type StructuredDaemonDiagnostic = {
  details?: Record<string, unknown>;
  event: string;
  level: "debug" | "info" | "warn";
};

function parseStructuredDaemonDiagnostic(
  message: string,
): StructuredDaemonDiagnostic | null {
  try {
    const parsed = JSON.parse(message) as Partial<StructuredDaemonDiagnostic>;
    if (
      !parsed ||
      typeof parsed.event !== "string" ||
      !["debug", "info", "warn"].includes(parsed.level ?? "")
    ) {
      return null;
    }

    return {
      details:
        parsed.details && typeof parsed.details === "object"
          ? parsed.details
          : undefined,
      event: parsed.event,
      level: parsed.level as StructuredDaemonDiagnostic["level"],
    };
  } catch {
    return null;
  }
}

/** Renderer-facing daemon health snapshot (no auth token). */
export interface DaemonRuntimeStatus {
  running: boolean;
  pid: number | null;
  protocolVersion: number | null;
  runtimeFingerprint: string | null;
  expectedRuntimeFingerprint: string | null;
  socketPath: string | null;
  startedAt: string | null;
  matchesRuntime: boolean;
  ownedByThisApp: boolean;
  error: string | null;
}

export interface DaemonRuntimeClient {
  createSession(
    payload: CreateSessionPayload,
  ): Promise<CreateSessionPayload["session"]>;
  deleteSession(sessionId: string): Promise<void>;
  dispose(): Promise<void>;
  getStatus(): Promise<DaemonRuntimeStatus>;
  initialize(): Promise<void>;
  listSlashCommands(
    agentType: AgentId,
    workspaceRootPath: string,
  ): Promise<AgentSlashCommand[]>;
  /** Stop the current daemon (if any) and start a matching runtime process. */
  restart(): Promise<DaemonRuntimeStatus>;
  resolvePermission(
    requestId: string,
    decision: AgentPermissionDecision,
  ): Promise<boolean>;
  resolveQuestion(questionId: string, answer: string): Promise<boolean>;
  resolvePlanApproval(
    approvalId: string,
    decision: AgentPlanApprovalDecision,
  ): Promise<boolean>;
  rewindSession(message: MessageRecord): Promise<void>;
  resumeQueuedSession(
    sessionId: string,
    providerConfig: AgentRuntimeProviderConfig | null,
  ): Promise<boolean>;
  sendMessage(
    payload: SendSessionMessagePayload,
    providerConfig: AgentRuntimeProviderConfig | null,
  ): Promise<MessageRecord>;
  updateQueuedInput(
    sessionId: string,
    messageId: string,
    content: string,
  ): Promise<MessageRecord>;
  deleteQueuedInput(sessionId: string, messageId: string): Promise<void>;
  steerQueuedInput(
    sessionId: string,
    messageId: string,
  ): Promise<MessageRecord>;
  setConfig(
    sessionId: string,
    configId: string,
    value: boolean | string,
  ): Promise<AgentSessionConfigOption[]>;
  setMode(sessionId: string, modeId: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
  undoTurnChanges(
    payload: UndoTurnChangesInput,
  ): Promise<UndoTurnChangesResult>;
  getTurnChangeFile(
    payload: TurnChangeFileContentRequest,
  ): Promise<TurnChangeFileContent>;
}

export function createDaemonRuntimeClient(
  options: DaemonRuntimeClientOptions,
): DaemonRuntimeClient {
  let daemonReady: Promise<void> | null = null;
  let disposed = false;
  let ownedDaemonProcess: OwnedDaemonProcess | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let subscription: DaemonEventSubscription | null = null;

  function requestOptions() {
    return { userDataPath: options.userDataPath };
  }

  async function ensureDaemon() {
    if (!daemonReady) {
      daemonReady = (async () => {
        const runtimeFingerprint = await readDaemonRuntimeFingerprint(
          options.daemonEntryPath,
        );
        try {
          const status = await requestDaemon("daemon.status", requestOptions());
          if (isExpectedDaemon(status, runtimeFingerprint)) {
            return;
          }
          process.kill(status.pid, "SIGTERM");
          if (await waitForExpectedDaemonOrExit(runtimeFingerprint)) {
            return;
          }
        } catch {
          // Missing metadata, a stale socket, or an outdated daemon all require
          // a fresh process using the bundled runtime.
        }
        startDaemonProcess(runtimeFingerprint);

        for (let attempt = 0; attempt < START_ATTEMPTS; attempt += 1) {
          await delay(START_RETRY_DELAY_MS);
          try {
            const status = await requestDaemon(
              "daemon.status",
              requestOptions(),
            );
            if (!isExpectedDaemon(status, runtimeFingerprint)) {
              continue;
            }
            options.logger.info("daemon.started", {
              attempts: attempt + 1,
            });
            return;
          } catch {
            // The child is still starting.
          }
        }

        throw new Error("Timed out waiting for the Cocurdex daemon");
      })().catch((error) => {
        daemonReady = null;
        throw error;
      });
    }

    return daemonReady;
  }

  async function waitForExpectedDaemonOrExit(runtimeFingerprint: string) {
    for (let attempt = 0; attempt < START_ATTEMPTS; attempt += 1) {
      await delay(START_RETRY_DELAY_MS);
      try {
        const status = await requestDaemon("daemon.status", requestOptions());
        if (isExpectedDaemon(status, runtimeFingerprint)) {
          return true;
        }
      } catch {
        return false;
      }
    }
    return false;
  }

  function startDaemonProcess(runtimeFingerprint: string) {
    const ownedProcess = spawnOwnedDaemonProcess({
      daemonEntryPath: options.daemonEntryPath,
      onDiagnostic(
        stream,
        message,
        source: DaemonDiagnosticSource = "diagnostic",
      ) {
        if (source === "stderr") {
          options.logger.warn("daemon.stderr", { message, stream });
          return;
        }

        const diagnostic = parseStructuredDaemonDiagnostic(message);
        if (!diagnostic) {
          options.logger.info("daemon.diagnostic", { message, stream });
          return;
        }

        let log = options.logger.info;
        if (diagnostic.level === "warn") {
          log = options.logger.warn;
        } else if (diagnostic.level === "debug") {
          log = options.logger.debug;
        }
        log("daemon.diagnostic", {
          ...(diagnostic.details ? { details: diagnostic.details } : {}),
          message: diagnostic.event,
          stream,
        });
      },
      onError(error) {
        options.logger.error("daemon.spawnFailed", {
          daemonEntryPath: options.daemonEntryPath,
          error: error.message,
        });
      },
      onExit(code, signal) {
        if (ownedDaemonProcess === ownedProcess) {
          ownedDaemonProcess = null;
        }
        options.logger.info("daemon.exited", { code, signal });
      },
      runtimeFingerprint,
      userDataPath: options.userDataPath,
    });
    ownedDaemonProcess = ownedProcess;
    options.logger.info("daemon.spawned", {
      daemonEntryPath: options.daemonEntryPath,
      pid: ownedProcess.pid,
    });
  }

  function scheduleSubscriptionReconnect(error?: Error) {
    subscription = null;
    daemonReady = null;
    if (disposed || reconnectTimer) {
      return;
    }

    options.logger.warn("daemon.subscriptionDisconnected", {
      error: error?.message,
    });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connectSubscription();
    }, RECONNECT_DELAY_MS);
  }

  async function connectSubscription() {
    if (disposed || subscription) {
      return;
    }

    try {
      await ensureDaemon();
      subscription = await subscribeDaemonEvents(options.onEvent, {
        ...requestOptions(),
        onDisconnect: scheduleSubscriptionReconnect,
      });
      options.logger.info("daemon.subscriptionConnected");
      options.onConnected?.();
    } catch (error) {
      scheduleSubscriptionReconnect(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  async function stopCurrentDaemon() {
    clearReconnectTimer();
    subscription?.close();
    subscription = null;
    daemonReady = null;

    const processToShutdown = ownedDaemonProcess;
    ownedDaemonProcess = null;
    if (processToShutdown) {
      await processToShutdown.shutdown();
      return;
    }

    try {
      const status = await requestDaemon("daemon.status", requestOptions());
      try {
        process.kill(status.pid, "SIGTERM");
      } catch {
        // Process may already be gone.
      }
      for (let attempt = 0; attempt < START_ATTEMPTS; attempt += 1) {
        await delay(START_RETRY_DELAY_MS);
        try {
          await requestDaemon("daemon.status", requestOptions());
        } catch {
          return;
        }
      }
    } catch {
      // Already stopped or metadata missing.
    }
  }

  async function getStatus(): Promise<DaemonRuntimeStatus> {
    let expectedRuntimeFingerprint: string | null = null;
    try {
      expectedRuntimeFingerprint = await readDaemonRuntimeFingerprint(
        options.daemonEntryPath,
      );
    } catch (error) {
      return {
        running: false,
        pid: null,
        protocolVersion: null,
        runtimeFingerprint: null,
        expectedRuntimeFingerprint: null,
        socketPath: null,
        startedAt: null,
        matchesRuntime: false,
        ownedByThisApp: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    try {
      const status = await requestDaemon("daemon.status", requestOptions());
      return {
        running: true,
        pid: status.pid,
        protocolVersion: status.protocolVersion,
        runtimeFingerprint: status.runtimeFingerprint,
        expectedRuntimeFingerprint,
        socketPath: status.socketPath,
        startedAt: status.startedAt,
        matchesRuntime: isExpectedDaemon(status, expectedRuntimeFingerprint),
        ownedByThisApp: ownedDaemonProcess?.pid === status.pid,
        error: null,
      };
    } catch (error) {
      return {
        running: false,
        pid: null,
        protocolVersion: null,
        runtimeFingerprint: null,
        expectedRuntimeFingerprint,
        socketPath: null,
        startedAt: null,
        matchesRuntime: false,
        ownedByThisApp: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    async createSession(payload) {
      await ensureDaemon();
      return requestDaemon("session.create", payload, requestOptions());
    },
    async deleteSession(sessionId) {
      await ensureDaemon();
      await requestDaemon("session.delete", { sessionId }, requestOptions());
    },
    async dispose() {
      disposed = true;
      clearReconnectTimer();
      subscription?.close();
      subscription = null;
      const processToShutdown = ownedDaemonProcess;
      ownedDaemonProcess = null;
      await processToShutdown?.shutdown();
    },
    getStatus,
    async initialize() {
      await ensureDaemon();
      await connectSubscription();
    },
    async restart() {
      if (disposed) {
        throw new Error("Daemon runtime client has been disposed");
      }
      options.logger.info("daemon.restartRequested");
      await stopCurrentDaemon();
      await ensureDaemon();
      await connectSubscription();
      const status = await getStatus();
      options.logger.info("daemon.restarted", {
        pid: status.pid,
        running: status.running,
        matchesRuntime: status.matchesRuntime,
      });
      return status;
    },
    async listSlashCommands(agentType, workspaceRootPath) {
      await ensureDaemon();
      return requestDaemon(
        "session.listSlashCommands",
        { agentType, workspaceRootPath },
        requestOptions(),
      );
    },
    async resolvePermission(requestId, decision) {
      await ensureDaemon();
      return requestDaemon(
        "permission.resolve",
        { requestId, decision },
        requestOptions(),
      );
    },
    async resolveQuestion(questionId, answer) {
      await ensureDaemon();
      return requestDaemon(
        "question.resolve",
        { questionId, answer },
        requestOptions(),
      );
    },
    async resolvePlanApproval(approvalId, decision) {
      await ensureDaemon();
      return requestDaemon(
        "planApproval.resolve",
        { approvalId, decision },
        requestOptions(),
      );
    },
    async rewindSession(message) {
      await ensureDaemon();
      await requestDaemon("session.rewind", { message }, requestOptions());
    },
    async resumeQueuedSession(sessionId, providerConfig) {
      await ensureDaemon();
      return requestDaemon(
        "session.resumeQueued",
        { sessionId, providerConfig },
        requestOptions(),
      );
    },
    async sendMessage(payload, providerConfig) {
      await ensureDaemon();
      return requestDaemon(
        "session.send",
        { message: payload, providerConfig },
        requestOptions(),
      );
    },
    async updateQueuedInput(sessionId, messageId, content) {
      await ensureDaemon();
      return requestDaemon(
        "session.updateQueued",
        { sessionId, messageId, content },
        requestOptions(),
      );
    },
    async deleteQueuedInput(sessionId, messageId) {
      await ensureDaemon();
      await requestDaemon(
        "session.deleteQueued",
        { sessionId, messageId },
        requestOptions(),
      );
    },
    async steerQueuedInput(sessionId, messageId) {
      await ensureDaemon();
      return requestDaemon(
        "session.steerQueued",
        { sessionId, messageId },
        requestOptions(),
      );
    },
    async setConfig(sessionId, configId, value) {
      await ensureDaemon();
      return requestDaemon(
        "session.setConfig",
        { sessionId, configId, value },
        requestOptions(),
      );
    },
    async setMode(sessionId, modeId) {
      await ensureDaemon();
      await requestDaemon(
        "session.setMode",
        { sessionId, modeId },
        requestOptions(),
      );
    },
    async stop(sessionId) {
      await ensureDaemon();
      await requestDaemon("session.stop", { sessionId }, requestOptions());
    },
    async undoTurnChanges(payload) {
      await ensureDaemon();
      return requestDaemon(
        "session.undoTurnChanges",
        payload,
        requestOptions(),
      );
    },
    async getTurnChangeFile(payload) {
      await ensureDaemon();
      return requestDaemon(
        "session.getTurnChangeFile",
        payload,
        requestOptions(),
      );
    },
  };
}

async function readDaemonRuntimeFingerprint(daemonEntryPath: string) {
  const daemonSource = await readFile(daemonEntryPath);
  return createHash("sha256").update(daemonSource).digest("hex");
}

function isExpectedDaemon(
  status: {
    protocolVersion: number;
    runtimeFingerprint: string;
  },
  runtimeFingerprint: string,
) {
  return (
    status.protocolVersion === DAEMON_PROTOCOL_VERSION &&
    status.runtimeFingerprint === runtimeFingerprint
  );
}

function delay(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
