import os from "node:os";
import { generatePiMemoryDigest } from "@cocurdex/agent-adapters";
import {
  type AgentRuntimeProviderConfig,
  buildMemoryRecallQuery,
  type CocurdexDaemonEvent,
  DEFAULT_MEMORY_CLOUD_STATUS,
  DEFAULT_MEMORY_SETTINGS,
  gateMemorySettings,
  isChatSession,
  type MemoryCloudConnectInput,
  type MemoryCloudConnectResult,
  type MemoryCloudKeys,
  type MemoryCloudStatus,
  type MemoryDoctorReport,
  type MemoryEntry,
  type MemoryImportance,
  type MemoryInstallResult,
  type MemoryPlatform,
  type MemoryRecallItem,
  type MemoryRecallOutcome,
  type MemoryRecallResult,
  type MemoryRecallStatus,
  type MemoryRememberInput,
  type MemoryRememberResult,
  type MemorySessionSaveInput,
  type MemorySessionSaveResult,
  type MemorySettings,
  type MemoryStatus,
  type MessageRecord,
  memoryPlatformSupportsRsrs,
  redactMemorySecrets,
  type SessionRecord,
} from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../diagnostics";
import { buildSnapshotProviderRecords } from "../provider/session-title";
import type { DaemonState } from "../state";
import {
  buildAgentMemoryPolicy,
  buildGateNudge,
  buildMemoryBrief,
  buildSessionDigestFallback,
  buildTranscriptForSummary,
  buildTurnDiaryLine,
  compactText as compactDigestText,
  conversationTurns,
} from "./digest";
import {
  exportRsrsKeys,
  installRsrs,
  loginRsrsAccount,
  logoutRsrs,
  materializeNativeBinary,
  parseRsrsCloudStatus,
  type RsrsCloudSummary,
  type RsrsExecutable,
  readRsrsDoctor,
  readRsrsPolicy,
  readRsrsStatus,
  readRsrsVersion,
  recallMemories,
  recallMemoriesViaRuntime,
  registerRsrsAccount,
  rememberMemory,
  rememberMemoryViaRuntime,
  resolveRsrsExecutable,
  showMemory,
  showMemoryViaRuntime,
  writeRsrsAutosync,
} from "./rsrs";
import {
  callRuntimeTool,
  ensureRuntime,
  listRuntimeTools,
  type RuntimeEndpoint,
} from "./runtime";
import {
  type MemoryCaptureMap,
  type MemoryInstallState,
  readMemoryCaptures,
  readMemoryInstallState,
  readMemorySettings,
  writeMemoryCapture,
  writeMemoryInstallState,
  writeMemorySettings,
} from "./settings";

const STATUS_CACHE_MS = 30_000;
const TURN_RECALL_BUDGET_MS = 2_000;
const CHAT_EXCERPT_BUDGET_MS = 4_000;
const SESSION_DIGEST_TIMEOUT_MS = 60_000;

type MemoryState = Pick<
  DaemonState,
  | "getAppSetting"
  | "setAppSetting"
  | "getSession"
  | "listSessions"
  | "listMessagesBySessionId"
  | "listWorkspaces"
>;

export interface MemoryServiceOptions {
  userDataPath: string;
  state: MemoryState;
  broadcast(event: CocurdexDaemonEvent): void;
  resolveSessionProvider(
    session: SessionRecord,
  ): Promise<AgentRuntimeProviderConfig | null>;
  device?: string;
  platform?: MemoryPlatform;
  rsrsDataDir?: string;
  startRuntime?: boolean;
  now?: () => Date;
}

export interface MemoryTurnContext {
  brief: string | null;
  items: MemoryRecallItem[];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function toCloudStatus(summary: RsrsCloudSummary | null): MemoryCloudStatus {
  if (!summary) return { ...DEFAULT_MEMORY_CLOUD_STATUS };
  const user = summary.account;
  const connected = summary.hasToken && Boolean(user);
  return {
    connected,
    user,
    server: summary.server,
    autosync: summary.autosync,
    hasKeys: summary.hasKeys,
    offline: summary.offline,
    syncing: summary.syncing,
    pending: summary.pending,
    conflicts: summary.conflicts,
    lastSyncAt: summary.lastSyncAt,
    error: summary.syncError,
  };
}

function redactSecrets(message: string, secrets: ReadonlyArray<string>) {
  let result = message;
  for (const secret of secrets) {
    if (!secret) continue;
    result = result.split(secret).join("[redacted]");
  }
  return result;
}

export class MemoryService {
  private settings: MemorySettings | null = null;
  private installState: MemoryInstallState | null = null;
  private initialization: Promise<void> | null = null;
  private executable: RsrsExecutable | null = null;
  private executableResolvedAt = 0;
  private statusCache: { status: MemoryStatus; at: number } | null = null;
  private installPromise: Promise<MemoryInstallResult> | null = null;
  private doctorPromise: Promise<MemoryDoctorReport> | null = null;
  private policyCache: string | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private readQueue: Promise<void> = Promise.resolve();
  private startupPromise: Promise<void> | null = null;
  private readonly gateTurns = new Map<
    string,
    { stored: boolean; nudge: boolean }
  >();
  private lastRecall: MemoryRecallStatus | null = null;
  private runtimeEndpoint: RuntimeEndpoint | null = null;
  private runtimeCheckedAt = 0;
  private runtimeTools: Map<string, Set<string>> | null = null;
  private readonly device: string;
  private readonly platform: MemoryPlatform;
  private readonly now: () => Date;

  constructor(private readonly options: MemoryServiceOptions) {
    this.device = options.device ?? `${os.hostname()}/${process.platform}`;
    this.platform = options.platform ?? {
      os: process.platform,
      arch: process.arch,
    };
    this.now = options.now ?? (() => new Date());
  }

  private get supported() {
    return memoryPlatformSupportsRsrs(this.platform);
  }

  private async ensureInitialized() {
    if (!this.initialization) {
      this.initialization = (async () => {
        try {
          this.settings = await readMemorySettings(this.options.state);
          this.installState = await readMemoryInstallState(this.options.state);
        } catch (error) {
          logDaemonDiagnostic("warn", "memory.initializeFailed", {
            error: errorMessage(error),
          });
          this.settings = null;
          this.installState = null;
        }
      })();
    }
    await this.initialization;
  }

  private currentSettings(): MemorySettings {
    return gateMemorySettings(
      this.settings ?? DEFAULT_MEMORY_SETTINGS,
      this.platform,
    );
  }

  private currentInstallState(): MemoryInstallState {
    return (
      this.installState ?? {
        attemptedAt: null,
        status: "idle",
        version: null,
        executable: null,
        error: null,
        doctor: null,
      }
    );
  }

  isEnabledSync() {
    return this.currentSettings().enabled;
  }

  areToolsEnabledSync() {
    const settings = this.currentSettings();
    return Boolean(settings.enabled && settings.agent.tools);
  }

  private isReadyForTurns() {
    if (!this.currentSettings().enabled) return false;
    return (
      this.statusCache?.status.available === true ||
      this.installState?.status === "ready"
    );
  }

  async getSettings(): Promise<MemorySettings> {
    await this.ensureInitialized();
    return this.currentSettings();
  }

  async setSettings(input: MemorySettings): Promise<MemorySettings> {
    await this.ensureInitialized();
    const settings = await writeMemorySettings(
      this.options.state,
      gateMemorySettings(input, this.platform),
    );
    this.settings = settings;
    this.statusCache = null;
    this.broadcast();
    return settings;
  }

  async initializeOnStartup() {
    if (this.startupPromise) return this.startupPromise;
    this.startupPromise = (async () => {
      await this.ensureInitialized();
      if (!this.currentSettings().enabled) return;
      if (this.currentInstallState().status === "installing") {
        await this.persistInstallState({
          ...this.currentInstallState(),
          status: "idle",
        });
      }
      void this.runtime().catch(() => undefined);
    })();
    return this.startupPromise;
  }

  private async resolveExecutable(force = false) {
    await this.ensureInitialized();
    if (!force && this.executable) return this.executable;
    if (
      !force &&
      this.now().getTime() - this.executableResolvedAt < STATUS_CACHE_MS
    ) {
      return this.executable;
    }
    const resolved = await resolveRsrsExecutable(this.currentSettings());
    this.executable =
      resolved?.source === "path"
        ? ((await materializeNativeBinary(resolved)) ?? resolved)
        : resolved;
    this.executableResolvedAt = this.now().getTime();
    return this.executable;
  }

  private async persistInstallState(state: MemoryInstallState) {
    this.installState = state;
    this.statusCache = null;
    try {
      await writeMemoryInstallState(this.options.state, state);
    } catch (error) {
      logDaemonDiagnostic("warn", "memory.installStateWriteFailed", {
        error: errorMessage(error),
      });
    }
    this.broadcast();
  }

  private broadcast() {
    this.options.broadcast({ type: "data.changed", areas: ["memory"] });
  }

  async getStatus(refresh = false): Promise<MemoryStatus> {
    const status = await this.computeStatus(refresh);
    return { ...status, lastRecall: this.lastRecall };
  }

  private async computeStatus(refresh = false): Promise<MemoryStatus> {
    await this.ensureInitialized();
    const now = this.now().getTime();
    if (
      !refresh &&
      this.statusCache &&
      now - this.statusCache.at < STATUS_CACHE_MS
    ) {
      return this.statusCache.status;
    }
    const settings = this.currentSettings();
    const installState = this.currentInstallState();
    const executable = await this.resolveExecutable(refresh);
    if (!executable) {
      const status: MemoryStatus = {
        settings,
        enabled: settings.enabled,
        supported: this.supported,
        available: false,
        installation:
          installState.status === "installing"
            ? "installing"
            : installState.status === "failed"
              ? "failed"
              : "missing",
        version: installState.version,
        executable: null,
        dataDir: null,
        account: null,
        space: null,
        cloud: { ...DEFAULT_MEMORY_CLOUD_STATUS, autosync: false },
        doctor: installState.doctor,
        error: installState.error,
        checkedAt: installState.attemptedAt,
        lastRecall: null,
      };
      this.statusCache = { status, at: now };
      return status;
    }
    const runtimeStatus = await this.runtimeStatus(executable.command);
    if (runtimeStatus) {
      this.statusCache = { status: runtimeStatus, at: now };
      return runtimeStatus;
    }
    const [versionResult, statusResult] = await Promise.allSettled([
      readRsrsVersion(executable, 4_000),
      readRsrsStatus(executable, 20_000),
    ]);
    const version =
      versionResult.status === "fulfilled"
        ? (versionResult.value ?? installState.version)
        : installState.version;
    const summary =
      statusResult.status === "fulfilled" ? statusResult.value : null;
    const error =
      statusResult.status === "rejected"
        ? errorMessage(statusResult.reason)
        : versionResult.status === "rejected"
          ? errorMessage(versionResult.reason)
          : null;
    const status: MemoryStatus = {
      settings,
      enabled: settings.enabled,
      supported: this.supported,
      available: true,
      installation:
        installState.status === "installing" ? "installing" : "ready",
      version,
      executable: executable.command,
      dataDir: summary?.dataDir ?? null,
      account: summary?.account ?? null,
      space: summary?.space ?? null,
      cloud: toCloudStatus(summary),
      doctor: installState.doctor,
      error,
      checkedAt: this.now().toISOString(),
      lastRecall: null,
    };
    this.statusCache = { status, at: now };
    return status;
  }

  async install(force = false): Promise<MemoryInstallResult> {
    await this.ensureInitialized();
    if (!this.supported) {
      return {
        status: await this.getStatus(),
        installed: false,
        message: `The rsrs CLI has no build for ${this.platform.os}/${this.platform.arch}, so long-term memory stays off on this machine.`,
      };
    }
    if (this.installPromise) return this.installPromise;
    if (!force) {
      const state = this.currentInstallState();
      if (state.status === "ready" && (await this.resolveExecutable())) {
        return {
          status: await this.getStatus(true),
          installed: true,
          message: null,
        };
      }
    }
    this.installPromise = (async () => {
      const startedAt = this.now().toISOString();
      await this.persistInstallState({
        ...this.currentInstallState(),
        attemptedAt: startedAt,
        status: "installing",
        error: null,
      });
      try {
        let executable = await this.resolveExecutable(true);
        if (!executable) {
          const installed = await installRsrs({});
          logDaemonDiagnostic("info", "memory.installerSucceeded", {
            command: installed.command,
          });
          executable = await this.resolveExecutable(true);
        }
        if (!executable) {
          throw new Error(
            "rsrs was installed but no executable could be resolved",
          );
        }
        executable = (await materializeNativeBinary(executable)) ?? executable;
        this.executable = executable;
        const version = await readRsrsVersion(executable).catch(() => null);
        const doctor = await readRsrsDoctor(executable);
        await this.persistInstallState({
          attemptedAt: this.now().toISOString(),
          status: "ready",
          version: version ?? doctor.report.version,
          executable: executable.command,
          error: null,
          doctor: doctor.report,
        });
        return {
          status: await this.getStatus(true),
          installed: doctor.installed,
          message: doctor.installed
            ? null
            : "rsrs is installed but doctor reported a failing critical check",
        };
      } catch (error) {
        const message = errorMessage(error);
        await this.persistInstallState({
          ...this.currentInstallState(),
          attemptedAt: this.now().toISOString(),
          status: "failed",
          error: message,
        });
        logDaemonDiagnostic("warn", "memory.installFailed", {
          error: message,
        });
        return {
          status: await this.getStatus(true),
          installed: false,
          message,
        };
      } finally {
        this.installPromise = null;
      }
    })();
    return this.installPromise;
  }

  async doctor(options: { remote?: boolean; checkUpdate?: boolean } = {}) {
    await this.ensureInitialized();
    if (this.doctorPromise) return this.doctorPromise;
    this.doctorPromise = (async () => {
      const executable = await this.resolveExecutable(true);
      if (!executable) {
        throw new Error("rsrs is not installed");
      }
      const result = await readRsrsDoctor(executable, options);
      const version = await readRsrsVersion(executable).catch(
        () => result.report.version,
      );
      await this.persistInstallState({
        attemptedAt: this.now().toISOString(),
        status: result.installed ? "ready" : "failed",
        version,
        executable: executable.command,
        error: result.installed
          ? null
          : "rsrs doctor reported a failing critical check",
        doctor: result.report,
      });
      return result.report;
    })().finally(() => {
      this.doctorPromise = null;
    });
    return this.doctorPromise;
  }

  private async cloudExecutable() {
    const executable = await this.resolveExecutable(true);
    if (!executable) throw new Error("rsrs is not installed");
    return executable;
  }

  private async refreshAfterCloudMutation() {
    this.invalidateRuntime();
    this.statusCache = null;
    const status = await this.getStatus(true);
    this.broadcast();
    return status;
  }

  async connectCloud(
    input: MemoryCloudConnectInput,
  ): Promise<MemoryCloudConnectResult> {
    await this.ensureInitialized();
    if (!this.supported) {
      throw new Error(
        `The rsrs CLI has no build for ${this.platform.os}/${this.platform.arch}, so cloud sync stays off on this machine.`,
      );
    }
    const user = input.user.trim();
    const password = input.password;
    const recoveryKey = input.recoveryKey?.trim() ?? "";
    if (user.length < 3) {
      throw new Error("Username must be at least 3 characters");
    }
    if (password.length < 8) {
      throw new Error("Login password must be at least 8 characters");
    }
    if (input.mode === "signin" && !recoveryKey) {
      throw new Error(
        "The recovery key is required to sign in on a new device",
      );
    }
    const executable = await this.cloudExecutable();
    try {
      const issued =
        input.mode === "register"
          ? (await registerRsrsAccount(executable, { user, password }))
              .recoveryKey
          : (
              await loginRsrsAccount(executable, {
                user,
                password,
                recoveryKey: recoveryKey || null,
              })
            ).recoveryKey;
      await writeRsrsAutosync(executable, true).catch((error) => {
        logDaemonDiagnostic("warn", "memory.cloudAutosyncFailed", {
          error: errorMessage(error),
        });
      });
      this.executable = executable;
      this.executableResolvedAt = this.now().getTime();
      const status = await this.refreshAfterCloudMutation();
      return { status, recoveryKey: issued };
    } catch (error) {
      const message = redactSecrets(errorMessage(error), [
        password,
        recoveryKey,
      ]);
      logDaemonDiagnostic("warn", "memory.cloudConnectFailed", {
        error: message,
        mode: input.mode,
      });
      throw new Error(message);
    }
  }

  async disconnectCloud(): Promise<MemoryStatus> {
    await this.ensureInitialized();
    const executable = await this.cloudExecutable();
    try {
      await logoutRsrs(executable);
    } catch (error) {
      const message = errorMessage(error);
      logDaemonDiagnostic("warn", "memory.cloudDisconnectFailed", {
        error: message,
      });
      throw new Error(message);
    }
    return this.refreshAfterCloudMutation();
  }

  async setCloudSync(enabled: boolean): Promise<MemoryStatus> {
    await this.ensureInitialized();
    const executable = await this.cloudExecutable();
    if (enabled) {
      const summary = await readRsrsStatus(executable).catch(() => null);
      if (!toCloudStatus(summary).connected) {
        throw new Error(
          "Connect an rsrs account before turning on multi-device sync",
        );
      }
    }
    await writeRsrsAutosync(executable, enabled);
    return this.refreshAfterCloudMutation();
  }

  async cloudKeys(): Promise<MemoryCloudKeys> {
    await this.ensureInitialized();
    const executable = await this.cloudExecutable();
    return { content: await exportRsrsKeys(executable) };
  }

  private enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(task, task);
    this.writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private enqueueRead<T>(task: () => Promise<T>): Promise<T> {
    const run = this.readQueue.then(task, task);
    this.readQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async runtime(): Promise<RuntimeEndpoint | null> {
    if (this.runtimeEndpoint) {
      if (this.now().getTime() - this.runtimeCheckedAt < STATUS_CACHE_MS) {
        return this.runtimeEndpoint;
      }
    }
    const executable = await this.resolveExecutable();
    if (!executable) return null;
    let endpoint: RuntimeEndpoint | null = null;
    try {
      endpoint = await ensureRuntime({
        command: executable.command,
        dataDir: this.options.rsrsDataDir,
        autoStart: this.options.startRuntime !== false,
        now: () => this.now().getTime(),
      });
    } catch (error) {
      logDaemonDiagnostic("info", "memory.runtimeUnavailable", {
        error: errorMessage(error),
      });
    }
    this.runtimeEndpoint = endpoint;
    this.runtimeCheckedAt = this.now().getTime();
    this.runtimeTools = endpoint
      ? await listRuntimeTools(endpoint).catch(() => null)
      : null;
    return endpoint;
  }

  private runtimeSupports(tool: string, argument: string) {
    return this.runtimeTools?.get(tool)?.has(argument) ?? false;
  }

  private async runtimeStatus(
    executableCommand: string,
  ): Promise<MemoryStatus | null> {
    const runtime = await this.runtime();
    if (!runtime) return null;
    let payload: Record<string, unknown>;
    try {
      payload = await callRuntimeTool(runtime, "memory_status", {}, 5_000);
    } catch (error) {
      logDaemonDiagnostic("info", "memory.runtimeStatusFailed", {
        error: errorMessage(error),
      });
      this.invalidateRuntime();
      return null;
    }
    const cloudSummary = parseRsrsCloudStatus(payload);
    const settings = this.currentSettings();
    const installState = this.currentInstallState();
    return {
      settings,
      enabled: settings.enabled,
      supported: this.supported,
      available: true,
      installation:
        installState.status === "installing" ? "installing" : "ready",
      version: runtime.bin ?? installState.version,
      executable: executableCommand,
      dataDir: cloudSummary.dataDir,
      account: cloudSummary.account,
      space: cloudSummary.space,
      cloud: toCloudStatus(cloudSummary),
      doctor: installState.doctor,
      error: null,
      checkedAt: this.now().toISOString(),
      lastRecall: null,
    };
  }

  private invalidateRuntime() {
    this.runtimeEndpoint = null;
    this.runtimeCheckedAt = 0;
    this.runtimeTools = null;
  }

  private async viaRuntime<T>(
    runtime: RuntimeEndpoint | null,
    call: (endpoint: RuntimeEndpoint) => Promise<T>,
    fallback: () => Promise<T>,
  ): Promise<T> {
    if (!runtime) return fallback();
    try {
      return await call(runtime);
    } catch (error) {
      logDaemonDiagnostic("info", "memory.runtimeCallFailed", {
        error: errorMessage(error),
      });
      this.invalidateRuntime();
      return fallback();
    }
  }

  async recall(input: {
    query: string;
    limit?: number;
    project?: string | null;
    timeoutMs?: number;
  }): Promise<MemoryRecallResult> {
    await this.ensureInitialized();
    const query = input.query.trim();
    const limit = Math.min(20, Math.max(1, Math.floor(input.limit ?? 8)));
    if (!query || !this.currentSettings().enabled) {
      return { query, items: [], truncated: false };
    }
    const executable = await this.resolveExecutable();
    if (!executable) {
      return { query, items: [], truncated: false };
    }
    return this.enqueueRead(async () => {
      const runtime = await this.runtime();
      const viaRuntime =
        runtime !== null &&
        (!input.project || this.runtimeSupports("memory_recall", "project"));
      const result = await this.viaRuntime(
        viaRuntime ? runtime : null,
        (endpoint) =>
          recallMemoriesViaRuntime(endpoint, {
            query,
            limit,
            timeoutMs: input.timeoutMs,
          }),
        () =>
          recallMemories(executable, {
            query,
            limit,
            project: input.project ?? null,
            timeoutMs: input.timeoutMs,
          }),
      );
      if (result.error) {
        logDaemonDiagnostic("info", "memory.recallReportedError", {
          error: result.error,
        });
      }
      return {
        query,
        items: result.items.slice(0, limit),
        truncated: result.items.length > limit,
      };
    });
  }

  async show(id: string, timeoutMs?: number): Promise<MemoryEntry | null> {
    await this.ensureInitialized();
    if (!this.currentSettings().enabled) return null;
    const executable = await this.resolveExecutable();
    if (!executable) return null;
    const result = await this.enqueueRead(async () => {
      const runtime = await this.runtime();
      return this.viaRuntime(
        runtime,
        (endpoint) => showMemoryViaRuntime(endpoint, id, timeoutMs),
        () => showMemory(executable, id, timeoutMs),
      );
    });
    if (result.error) {
      logDaemonDiagnostic("info", "memory.showReportedError", {
        error: result.error,
      });
    }
    return result.entry;
  }

  async remember(input: MemoryRememberInput): Promise<MemoryRememberResult> {
    await this.ensureInitialized();
    if (!this.currentSettings().enabled) {
      return {
        action: "skipped",
        id: null,
        title: null,
        candidates: [],
        message: "Memory is disabled",
      };
    }
    const content = redactMemorySecrets(input.content).trim();
    const title = redactMemorySecrets(input.title).trim();
    if (!content || !title) {
      return {
        action: "skipped",
        id: null,
        title: null,
        candidates: [],
        message: "Memory content and title are required",
      };
    }
    const executable = await this.resolveExecutable();
    if (!executable) {
      return {
        action: "skipped",
        id: null,
        title: null,
        candidates: [],
        message: "rsrs is not installed",
      };
    }
    return this.enqueueWrite(async () => {
      const runtime = await this.runtime();
      const viaRuntime =
        runtime !== null &&
        (!input.project ||
          this.runtimeSupports("memory_remember", "project")) &&
        (!input.tags?.length ||
          this.runtimeSupports("memory_remember", "tags"));
      const result = await this.viaRuntime(
        viaRuntime ? runtime : null,
        (endpoint) =>
          rememberMemoryViaRuntime(endpoint, { ...input, content, title }),
        () => rememberMemory(executable, { ...input, content, title }),
      );
      if (result.action === "created") this.broadcast();
      return result;
    });
  }

  async policy() {
    await this.ensureInitialized();
    if (!this.currentSettings().enabled) return "";
    if (this.policyCache) return this.policyCache;
    const executable = await this.resolveExecutable();
    if (!executable) return "";
    try {
      this.policyCache = await readRsrsPolicy(executable);
      return this.policyCache;
    } catch (error) {
      logDaemonDiagnostic("info", "memory.policyReadFailed", {
        error: errorMessage(error),
      });
      return "";
    }
  }

  async beginTurn(input: {
    sessionId: string;
    mode: "agent" | "chat";
    enforce: boolean;
  }): Promise<string | null> {
    await this.ensureInitialized();
    if (
      !this.currentSettings().enabled ||
      !this.isReadyForTurns() ||
      input.mode === "chat" ||
      !input.enforce
    ) {
      this.gateTurns.delete(input.sessionId);
      return null;
    }
    const previous = this.gateTurns.get(input.sessionId);
    this.gateTurns.set(input.sessionId, { stored: false, nudge: false });
    return previous?.nudge === true ? buildGateNudge() : null;
  }

  noteGateToolUse(sessionId: string, tool: "recall" | "show" | "remember") {
    if (tool !== "remember") return;
    const turn = this.gateTurns.get(sessionId);
    if (turn) turn.stored = true;
  }

  async finishTurn(input: {
    sessionId: string;
    enforce: boolean;
  }): Promise<boolean> {
    const turn = this.gateTurns.get(input.sessionId);
    if (!turn) return false;
    await this.ensureInitialized();
    if (
      !input.enforce ||
      !this.currentSettings().enabled ||
      !this.isReadyForTurns() ||
      turn.stored
    ) {
      this.gateTurns.delete(input.sessionId);
      return false;
    }
    turn.nudge = true;
    logDaemonDiagnostic("info", "memory.gateStoreMissed", {
      sessionId: input.sessionId,
    });
    return true;
  }

  async buildTurnContext(
    session: SessionRecord,
    message: string,
    mode: "agent" | "chat",
  ): Promise<MemoryTurnContext | null> {
    await this.ensureInitialized();
    const settings = this.currentSettings();
    if (!this.isReadyForTurns()) return null;
    if (!settings.enabled) return null;
    if (mode === "agent" && !settings.agent.injectContext) return null;
    if (mode === "chat" && !settings.chat.recall) return null;
    const query = buildMemoryRecallQuery({
      project: null,
      title: session.title,
      message,
    });
    if (!query) return null;
    let result: MemoryRecallResult;
    try {
      result = await this.recall({
        query,
        limit: 6,
        timeoutMs: TURN_RECALL_BUDGET_MS,
      });
    } catch (error) {
      this.noteRecall(session.id, mode, "failed", errorMessage(error));
      logDaemonDiagnostic("warn", "memory.turnRecallFailed", {
        error: errorMessage(error),
        sessionId: session.id,
      });
      return null;
    }
    if (result.items.length === 0) {
      this.noteRecall(session.id, mode, "empty", null);
      return null;
    }
    this.noteRecall(session.id, mode, "recalled", null);
    const excerpts = new Map<string, string>();
    if (mode === "chat") {
      const selected = result.items.slice(0, 2);
      const shown = await Promise.all(
        selected.map(async (item) => {
          try {
            const entry = await this.show(item.id, CHAT_EXCERPT_BUDGET_MS);
            return entry ? ([item.id, entry.content] as const) : null;
          } catch {
            return null;
          }
        }),
      );
      for (const pair of shown) {
        if (pair) excerpts.set(pair[0], pair[1]);
      }
    }
    return {
      brief: buildMemoryBrief(result.items, {
        excerpts,
        hasTools: mode === "agent",
      }),
      items: result.items,
    };
  }

  private noteRecall(
    sessionId: string,
    mode: "agent" | "chat",
    outcome: MemoryRecallOutcome,
    error: string | null,
  ) {
    const previous = this.lastRecall;
    if (
      previous?.sessionId === sessionId &&
      previous.outcome === outcome &&
      previous.error === error
    ) {
      return;
    }
    this.lastRecall = {
      sessionId,
      mode,
      outcome,
      error,
      at: this.now().toISOString(),
    };
    this.broadcast();
  }

  async captureTurn(
    sessionId: string,
    assistantMessageId: string | null,
  ): Promise<MemorySessionSaveResult> {
    await this.ensureInitialized();
    const settings = this.currentSettings();
    if (!settings.enabled || !settings.chat.saveTurns) {
      return { saved: false, memoryId: null, reason: "disabled" };
    }
    if (!this.isReadyForTurns()) {
      return { saved: false, memoryId: null, reason: "unavailable" };
    }
    const session = await this.options.state.getSession(sessionId);
    if (!session || !isChatSession(session)) {
      return { saved: false, memoryId: null, reason: "not-chat" };
    }
    const messages =
      await this.options.state.listMessagesBySessionId(sessionId);
    const user = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    const assistant = assistantMessageId
      ? messages.find((message) => message.id === assistantMessageId)
      : [...messages].reverse().find((message) => message.role === "assistant");
    if (!user || !assistant || assistant.role !== "assistant") {
      return { saved: false, memoryId: null, reason: "no-turn" };
    }
    const captures = await readMemoryCaptures(this.options.state);
    const previous = captures[sessionId];
    if (
      previous?.kind === "turn" &&
      previous.lastAssistantMessageId === assistant.id
    ) {
      return { saved: false, memoryId: previous.memoryId, reason: "duplicate" };
    }
    const line = buildTurnDiaryLine({
      session,
      userMessage: user.content,
      assistantMessage: assistant.content,
      device: this.device,
      at: assistant.createdAt,
    });
    const result = await this.remember({
      content: redactMemorySecrets(line),
      title: `Cocurdex chat：${compactDigestText(session.title, 48)}`,
      importance: "trivial",
      force: true,
    });
    if (!result.id) {
      return {
        saved: false,
        memoryId: null,
        reason: result.message ?? "not-written",
      };
    }
    await writeMemoryCapture(this.options.state, sessionId, {
      memoryId: result.id,
      savedAt: this.now().toISOString(),
      lastAssistantMessageId: assistant.id,
      kind: "turn",
    });
    this.broadcast();
    return { saved: true, memoryId: result.id, reason: null };
  }

  async saveSession(
    input: MemorySessionSaveInput,
  ): Promise<MemorySessionSaveResult> {
    await this.ensureInitialized();
    const settings = this.currentSettings();
    if (!settings.enabled) {
      return { saved: false, memoryId: null, reason: "disabled" };
    }
    if (!settings.chat.saveOnEnd && !input.force) {
      return { saved: false, memoryId: null, reason: "disabled" };
    }
    if (!(await this.resolveExecutable())) {
      return { saved: false, memoryId: null, reason: "unavailable" };
    }
    const session = await this.options.state.getSession(input.sessionId);
    if (!session || !isChatSession(session)) {
      return { saved: false, memoryId: null, reason: "not-chat" };
    }
    const messages = await this.options.state.listMessagesBySessionId(
      session.id,
    );
    const lastAssistant = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
    const captures = await readMemoryCaptures(this.options.state);
    const previous = captures[session.id];
    if (
      !input.force &&
      previous?.kind === "session" &&
      previous.lastAssistantMessageId === (lastAssistant?.id ?? null)
    ) {
      return { saved: false, memoryId: previous.memoryId, reason: "duplicate" };
    }
    const turns = conversationTurns(messages);
    if (turns === 0) {
      return { saved: false, memoryId: null, reason: "empty-session" };
    }
    const transcript = buildTranscriptForSummary(messages);
    const digest = await this.summarizeSession(session, transcript);
    const endedAt = this.now().toISOString();
    const startedAt = session.createdAt ? Date.parse(session.createdAt) : NaN;
    const durationSeconds = Number.isFinite(startedAt)
      ? Math.max(0, (Date.parse(endedAt) - startedAt) / 1000)
      : null;
    const lastAssistantText = lastAssistant?.content ?? null;
    const body =
      digest?.body ??
      buildSessionDigestFallback({
        session,
        messages,
        device: this.device,
        endedAt,
        durationSeconds,
        turns,
        outcome: lastAssistantText,
      });
    const importance: MemoryImportance =
      input.importance ?? digest?.importance ?? "trivial";
    const stored = await this.storeSessionMemory({
      content: redactMemorySecrets(body),
      title:
        digest?.title ??
        `Cocurdex chat：${compactDigestText(session.title, 48)}`,
      importance,
    });
    if (!stored.id) {
      return {
        saved: false,
        memoryId: null,
        reason: stored.message ?? stored.action,
      };
    }
    await writeMemoryCapture(this.options.state, session.id, {
      memoryId: stored.id,
      savedAt: endedAt,
      lastAssistantMessageId: lastAssistant?.id ?? null,
      kind: "session",
    });
    this.broadcast();
    return { saved: true, memoryId: stored.id, reason: null };
  }

  private async storeSessionMemory(input: {
    content: string;
    title: string;
    importance: MemoryImportance;
  }): Promise<MemoryRememberResult> {
    const judged = await this.remember(input);
    if (judged.action !== "candidates" || judged.id) return judged;
    const parentId = judged.candidates[0]?.id ?? null;
    if (!parentId) return judged;
    logDaemonDiagnostic("info", "memory.sessionAttached", {
      parentId,
      title: input.title,
    });
    return this.remember({ ...input, parentId });
  }

  private async summarizeSession(session: SessionRecord, transcript: string) {
    if (!transcript.trim()) return null;
    let runtime: AgentRuntimeProviderConfig | null = null;
    try {
      runtime = await this.options.resolveSessionProvider(session);
    } catch (error) {
      logDaemonDiagnostic("info", "memory.digestProviderFailed", {
        error: errorMessage(error),
        sessionId: session.id,
      });
      return null;
    }
    if (!runtime?.baseUrl || !runtime.modelId) return null;
    const { provider, model } = buildSnapshotProviderRecords(runtime);
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      SESSION_DIGEST_TIMEOUT_MS,
    );
    timer.unref?.();
    try {
      return await generatePiMemoryDigest({
        provider,
        model,
        apiKey: runtime.apiKey ?? null,
        sessionTitle: session.title,
        transcript,
        sessionId: session.id,
        signal: controller.signal,
      });
    } catch (error) {
      logDaemonDiagnostic("info", "memory.digestSkipped", {
        error: errorMessage(error),
        sessionId: session.id,
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  agentInstructions(hasTools: boolean) {
    if (!hasTools || !this.isEnabledSync()) return "";
    return buildAgentMemoryPolicy(true);
  }

  async getCaptures(): Promise<MemoryCaptureMap> {
    await this.ensureInitialized();
    return readMemoryCaptures(this.options.state);
  }

  async getTurnMessages(sessionId: string): Promise<MessageRecord[]> {
    return this.options.state.listMessagesBySessionId(sessionId);
  }
}
