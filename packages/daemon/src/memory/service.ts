import { realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generatePiMemoryDigest } from "@cocurdex/agent-adapters";
import {
  type AgentRuntimeProviderConfig,
  buildMemoryRecallQuery,
  type CocurdexDaemonEvent,
  DEFAULT_MEMORY_CLOUD_STATUS,
  DEFAULT_MEMORY_SETTINGS,
  gateMemorySettings,
  isChatSession,
  isMissingMemoryIdentity,
  isUserLibraryMemoryId,
  MEMORY_DISABLED_MESSAGE,
  MEMORY_MISSING_EXECUTABLE_MESSAGE,
  type MemoryCloudConnectInput,
  type MemoryCloudConnectResult,
  type MemoryCloudKeys,
  type MemoryCloudStatus,
  type MemoryDoctorReport,
  type MemoryEntry,
  type MemoryImportance,
  type MemoryImportResult,
  type MemoryInstallResult,
  type MemoryListInput,
  type MemoryListResult,
  type MemoryPartition,
  type MemoryPlatform,
  type MemoryProviderCapabilities,
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
  type MemoryUpdateInput,
  type MemoryUserLibraryStatus,
  type MessageRecord,
  memoryPartitionProject,
  memoryPlatformSupportsRsrs,
  RSRS_CLI_VERSION,
  redactMemorySecrets,
  rsrsCliAsset,
  type SessionRecord,
  withMemoryIdentityHint,
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
import { needsManagedInstall } from "./install-policy";
import {
  PARTITION_UNAVAILABLE,
  readPartitionEntry,
  scopeRememberCandidates,
  validatePartitionRelations,
} from "./partition-access";
import { mergeRecallResults } from "./partition-recall";
import { personaMemoryBrief, personaMemoryPolicy } from "./persona-memory";
import type { MemoryProvider } from "./provider";
import {
  createRsrsLocalKeys,
  exportRsrsKeys,
  installRsrsModel,
  installRsrsRuntime,
  loginRsrsAccount,
  logoutRsrs,
  parseRsrsCloudStatus,
  type RsrsCloudSummary,
  readRsrsDoctor,
  readRsrsStatus,
  readRsrsVersion,
  registerRsrsAccount,
  startRsrsRuntime,
  writeRsrsAutosync,
} from "./rsrs";
import {
  allocateLoopbackPort,
  installManagedRsrsCli,
  prepareRsrsDataDir,
  type RsrsHome,
} from "./rsrs-install";
import { RsrsMemoryProvider } from "./rsrs-provider";
import {
  type MemoryCaptureMap,
  type MemoryInstallState,
  readMemoryCaptures,
  readMemoryInstallState,
  readMemorySettings,
  readRsrsRpcPort,
  writeMemoryCapture,
  writeMemoryInstallState,
  writeMemorySettings,
  writeRsrsRpcPort,
} from "./settings";
import { memoryStatusError } from "./status-health";
import { UserRsrsLibrary } from "./user-library";

const STATUS_CACHE_MS = 30_000;
const NO_USER_LIBRARY: MemoryUserLibraryStatus = {
  detected: false,
  reachable: false,
};
const USER_LIBRARY_READ_ONLY =
  "Entries from the user's own rsrs store are read-only in Cocurdex.";
const HOST_RSRS_NOTE =
  "Your global instructions may also tell you to run the `rsrs` command (rsrs recall, rsrs remember). Inside Cocurdex, the memory tools above are the long-term memory: use them for every recall and store, and do not run the `rsrs` command.";
const TURN_RECALL_BUDGET_MS = 8_000;
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
  turnRecallBudgetMs?: number;
  provider?: MemoryProvider;
  userLibraryHome?: string;
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

function rsrsDataDirFromEnv() {
  return process.env.RSRS_DATA_DIR?.trim() || undefined;
}

function hostLibc(): MemoryPlatform["libc"] {
  if (process.platform !== "linux") return undefined;
  const report = process.report?.getReport() as
    | { header?: { glibcVersionRuntime?: string } }
    | undefined;
  return report?.header?.glibcVersionRuntime ? "glibc" : "musl";
}

function withIdentityHint(message: string) {
  return isMissingMemoryIdentity(message)
    ? withMemoryIdentityHint(message)
    : message;
}

function redactSecrets(message: string, secrets: ReadonlyArray<string>) {
  let result = message;
  for (const secret of secrets) {
    if (!secret) continue;
    result = result.split(secret).join("[redacted]");
  }
  return result;
}

function clampRecallLimit(limit: number | undefined) {
  return Math.min(20, Math.max(1, Math.floor(limit ?? 8)));
}

export class MemoryService {
  private settings: MemorySettings | null = null;
  private installState: MemoryInstallState | null = null;
  private initialization: Promise<void> | null = null;
  private statusCache: { status: MemoryStatus; at: number } | null = null;
  private installPromise: Promise<MemoryInstallResult> | null = null;
  private doctorPromise: Promise<MemoryDoctorReport> | null = null;
  private policyCache: string | null = null;
  private startupPromise: Promise<void> | null = null;
  private homePromise: Promise<RsrsHome> | null = null;
  private readonly gateTurns = new Map<
    string,
    { stored: boolean; nudge: boolean }
  >();
  private lastRecall: MemoryRecallStatus | null = null;
  private readonly rsrs: RsrsMemoryProvider;
  private readonly userLibrary: UserRsrsLibrary;
  private readonly provider: MemoryProvider;
  private readonly device: string;
  private readonly platform: MemoryPlatform;
  private readonly now: () => Date;

  constructor(private readonly options: MemoryServiceOptions) {
    this.device = options.device ?? `${os.hostname()}/${process.platform}`;
    this.platform = options.platform ?? {
      os: process.platform,
      arch: process.arch,
      libc: hostLibc(),
    };
    this.now = options.now ?? (() => new Date());
    this.rsrs = new RsrsMemoryProvider({
      settings: () => this.currentSettings(),
      home: () => this.rsrsHome(),
      os: this.platform.os,
      startRuntime: options.startRuntime,
      now: () => this.now(),
    });
    this.provider = options.provider ?? this.rsrs;
    this.userLibrary = new UserRsrsLibrary({
      dataDir: () => this.userLibraryDir(),
      now: () => this.now().getTime(),
    });
  }

  // The user's own rsrs home, unless it is the store Cocurdex manages.
  private async userLibraryDir() {
    const dataDir = path.join(
      this.options.userLibraryHome ?? os.homedir(),
      ".rsrs",
    );
    const own = await this.rsrsHome().catch(() => null);
    if (!own) return null;
    const user = await realpath(dataDir).catch(() => null);
    if (!user) return null;
    const caseInsensitive =
      this.platform.os === "win32" || this.platform.os === "darwin";
    const same = caseInsensitive
      ? user.toLowerCase() === own.dataDir.toLowerCase()
      : user === own.dataDir;
    return same ? null : user;
  }

  private userLibraryEnabled() {
    return this.provider === this.rsrs && this.currentSettings().userLibrary;
  }

  private rsrsHome(): Promise<RsrsHome> {
    this.homePromise ??= (async () => {
      const dataDir = await prepareRsrsDataDir(
        this.options.rsrsDataDir ??
          rsrsDataDirFromEnv() ??
          path.join(this.options.userDataPath, "rsrs"),
      );
      let rpcPort = await readRsrsRpcPort(this.options.state);
      if (!rpcPort) {
        rpcPort = await allocateLoopbackPort();
        await writeRsrsRpcPort(this.options.state, rpcPort);
      }
      return { dataDir, rpcPort };
    })().catch((error: unknown) => {
      this.homePromise = null;
      throw error;
    });
    return this.homePromise;
  }

  private unsupportedMessage() {
    return `rsrs has no build for ${this.platform.os}/${this.platform.arch} yet, so long-term memory stays off on this machine.`;
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
    if (this.provider !== this.rsrs) return true;
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
    const previousSettings = this.currentSettings();
    const previousCliPath = previousSettings.cliPath;
    const settings = await writeMemorySettings(
      this.options.state,
      gateMemorySettings(input, this.platform),
    );
    this.settings = settings;
    if (settings.cliPath !== previousCliPath) this.rsrs.forgetExecutable();
    this.statusCache = null;
    this.broadcast();
    if (
      settings.enabled &&
      (!previousSettings.enabled || settings.cliPath !== previousCliPath)
    ) {
      void this.prepareEnabledStore();
    }
    if (previousSettings.enabled && !settings.enabled) {
      void this.rsrs.stopRuntime();
    }
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
      if (await this.needsInstall()) {
        void this.install(true);
        return;
      }
      await this.rsrs.warmup();
    })();
    return this.startupPromise;
  }

  // Runs in the background so turning memory on answers at once.
  private async prepareEnabledStore() {
    if (this.options.startRuntime === false) return;
    try {
      if (await this.needsInstall()) await this.install(true);
      else await this.rsrs.warmup(true);
    } catch (error) {
      logDaemonDiagnostic("info", "memory.prepareFailed", {
        error: errorMessage(error),
      });
    }
  }

  private async needsInstall() {
    const settings = this.currentSettings();
    return needsManagedInstall({
      supported: this.supported,
      enabled: settings.enabled,
      customCli: Boolean(settings.cliPath),
      installedVersion: this.currentInstallState().version,
      pinnedVersion: RSRS_CLI_VERSION,
      hasExecutable: (await this.resolveExecutable()) !== null,
    });
  }

  private async resolveExecutable(force = false) {
    await this.ensureInitialized();
    return this.rsrs.executable(force);
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
    const [status, userLibrary] = await Promise.all([
      this.computeStatus(refresh),
      this.provider === this.rsrs
        ? this.userLibrary.status().catch(() => NO_USER_LIBRARY)
        : NO_USER_LIBRARY,
    ]);
    return { ...status, userLibrary, lastRecall: this.lastRecall };
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
      // A report from an older managed CLI describes a store this release no
      // longer uses.
      const pinned = installState.version === RSRS_CLI_VERSION;
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
        version: pinned ? installState.version : null,
        executable: null,
        dataDir: null,
        account: null,
        space: null,
        cloud: { ...DEFAULT_MEMORY_CLOUD_STATUS, autosync: false },
        doctor: pinned ? installState.doctor : null,
        error: installState.error,
        checkedAt: installState.attemptedAt,
        lastRecall: null,
        userLibrary: NO_USER_LIBRARY,
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
      doctor:
        installState.doctor?.version === version ? installState.doctor : null,
      error: error ?? (summary ? memoryStatusError(summary) : null),
      checkedAt: this.now().toISOString(),
      lastRecall: null,
      userLibrary: NO_USER_LIBRARY,
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
        message: this.unsupportedMessage(),
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
        const executable = await this.setUpRsrs();
        this.policyCache = null;
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
        if (this.currentSettings().enabled) void this.rsrs.warmup();
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

  // Order matters with rsrs 2.x: the runtime host runs from the managed CLI,
  // keygen needs a running host, and `runtime start` completes the key
  // handoff (respire-cli#277).
  private async setUpRsrs() {
    const asset = rsrsCliAsset(this.platform);
    if (!asset) throw new Error(this.unsupportedMessage());
    if (!this.currentSettings().cliPath) {
      const { dataDir } = await this.rsrsHome();
      const managed = await installManagedRsrsCli({
        dataDir,
        os: this.platform.os,
        asset,
        beforeReplace: () => this.rsrs.stopRuntime(),
      });
      logDaemonDiagnostic("info", "memory.cliInstalled", {
        replaced: managed.replaced,
      });
    }
    const executable = await this.resolveExecutable(true);
    if (!executable) throw new Error(MEMORY_MISSING_EXECUTABLE_MESSAGE);
    this.rsrs.adoptExecutable(executable);
    await installRsrsRuntime(executable);
    const summary = await readRsrsStatus(executable, 120_000);
    if (!summary.hasKeys) {
      await createRsrsLocalKeys(executable);
      await startRsrsRuntime(executable);
    }
    await installRsrsModel(executable);
    this.rsrs.invalidateRuntime();
    return executable;
  }

  async doctor(options: { remote?: boolean; checkUpdate?: boolean } = {}) {
    await this.ensureInitialized();
    if (this.doctorPromise) return this.doctorPromise;
    this.doctorPromise = (async () => {
      const executable = await this.resolveExecutable(true);
      if (!executable) {
        throw new Error(MEMORY_MISSING_EXECUTABLE_MESSAGE);
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
    if (!executable) throw new Error(MEMORY_MISSING_EXECUTABLE_MESSAGE);
    return executable;
  }

  private async refreshAfterCloudMutation() {
    this.rsrs.invalidateRuntime();
    this.statusCache = null;
    const status = await this.getStatus(true);
    if (status.enabled && status.cloud.hasKeys && !status.error)
      void this.rsrs.warmup(true);
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
      this.rsrs.adoptExecutable(executable);
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

  private async runtimeStatus(
    executableCommand: string,
  ): Promise<MemoryStatus | null> {
    const runtime = await this.rsrs.runtimeStatus();
    if (!runtime) return null;
    const cloudSummary = parseRsrsCloudStatus(runtime.payload);
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
      doctor:
        installState.doctor?.version === (runtime.bin ?? installState.version)
          ? installState.doctor
          : null,
      error: memoryStatusError(cloudSummary),
      checkedAt: this.now().toISOString(),
      lastRecall: null,
      userLibrary: NO_USER_LIBRARY,
    };
  }

  private async readyProvider() {
    await this.ensureInitialized();
    if (!this.currentSettings().enabled) return MEMORY_DISABLED_MESSAGE;
    if (!(await this.provider.available())) {
      return MEMORY_MISSING_EXECUTABLE_MESSAGE;
    }
    return null;
  }

  private async requireProvider() {
    const blocked = await this.readyProvider();
    if (blocked) throw new Error(blocked);
    return this.provider;
  }

  async recall(input: {
    query: string;
    limit?: number;
    project?: string | null;
    timeoutMs?: number;
  }): Promise<MemoryRecallResult> {
    const query = input.query.trim();
    const limit = clampRecallLimit(input.limit);
    if (!query) {
      return { query, items: [], truncated: false, error: null };
    }
    const blocked = await this.readyProvider();
    if (blocked) {
      return { query, items: [], truncated: false, error: blocked };
    }
    const project = input.project ?? null;
    const [result, reference] = await Promise.all([
      this.provider.recall({
        query,
        limit,
        project,
        timeoutMs: input.timeoutMs,
      }),
      project ? [] : this.recallUserLibrary(query, limit, input.timeoutMs),
    ]);
    const error = result.error ? withIdentityHint(result.error) : null;
    if (error) {
      logDaemonDiagnostic("info", "memory.recallReportedError", { error });
    }
    const titles = new Set(result.items.map((item) => item.title));
    const items = [
      ...result.items,
      ...reference.filter((item) => !titles.has(item.title)),
    ].sort(
      (a, b) =>
        (b.score ?? Number.NEGATIVE_INFINITY) -
        (a.score ?? Number.NEGATIVE_INFINITY),
    );
    return {
      query,
      items: items.slice(0, limit),
      truncated: items.length > limit,
      error,
    };
  }

  // A partitioned recall (personal assistants) never reads the user's own
  // store; it has no partitions and would leak across them.
  private async recallUserLibrary(
    query: string,
    limit: number,
    timeoutMs = TURN_RECALL_BUDGET_MS,
  ) {
    if (!this.userLibraryEnabled()) return [];
    return this.userLibrary
      .recall({ query, limit, timeoutMs })
      .catch((error: unknown): MemoryRecallItem[] => {
        logDaemonDiagnostic("info", "memory.userLibraryRecallFailed", {
          error: errorMessage(error),
        });
        return [];
      });
  }

  private assertWritable(ids: ReadonlyArray<string | null | undefined>) {
    if (ids.some((id) => id && isUserLibraryMemoryId(id))) {
      throw new Error(USER_LIBRARY_READ_ONLY);
    }
  }

  async show(id: string, timeoutMs?: number): Promise<MemoryEntry | null> {
    if (await this.readyProvider()) return null;
    if (isUserLibraryMemoryId(id)) {
      if (!this.userLibraryEnabled()) return null;
      return this.userLibrary.show(id, timeoutMs ?? 25_000).catch(() => null);
    }
    const result = await this.provider.show(id, timeoutMs);
    if (result.error) {
      logDaemonDiagnostic("info", "memory.showReportedError", {
        error: result.error,
      });
    }
    return result.entry;
  }

  async recallIn(
    input: { query: string; limit?: number; timeoutMs?: number },
    partitions: MemoryPartition[] | null,
  ): Promise<MemoryRecallResult> {
    if (!partitions?.length) {
      return this.recall(input);
    }
    if (!(await this.supportsPartitions())) {
      return {
        query: input.query.trim(),
        items: [],
        truncated: false,
        error: PARTITION_UNAVAILABLE,
      };
    }
    const results = await Promise.all(
      partitions.map((partition) =>
        this.recall({
          ...input,
          project: memoryPartitionProject(partition),
        }).catch(
          (error): MemoryRecallResult => ({
            query: input.query.trim(),
            items: [],
            truncated: false,
            error: errorMessage(error),
          }),
        ),
      ),
    );
    return mergeRecallResults(results, clampRecallLimit(input.limit));
  }

  async rememberIn(
    input: MemoryRememberInput,
    partition: MemoryPartition | null,
  ): Promise<MemoryRememberResult> {
    if (!partition) {
      return this.remember(input);
    }
    const blocked = await this.readyProvider();
    if (blocked)
      return {
        action: "skipped",
        id: null,
        title: null,
        candidates: [],
        message: blocked,
      };
    const validated = await validatePartitionRelations(
      this.provider,
      input,
      partition,
    );
    const scopedInput = {
      ...validated,
      project: memoryPartitionProject(partition),
    };
    const result = await this.remember(scopedInput);
    const scoped = await scopeRememberCandidates(
      this.provider,
      result,
      partition,
    );
    // rsrs deduplicates a write against the whole library, not the `--project`
    // it targets. When every candidate lies in another partition, nothing here
    // can absorb the write, so it is stored as new.
    const onlyForeignCandidates =
      scoped.action === "candidates" &&
      result.candidates.length > 0 &&
      scoped.candidates.length === 0;
    if (!onlyForeignCandidates) return scoped;
    return this.remember({ ...scopedInput, force: true });
  }

  async showIn(
    id: string,
    partitions: MemoryPartition[] | null,
    timeoutMs?: number,
  ) {
    if (!partitions?.length) return this.show(id, timeoutMs);
    if (await this.readyProvider()) return null;
    return readPartitionEntry(this.provider, id, partitions, timeoutMs);
  }

  private async supportsPartitions() {
    return (await this.capabilities())?.partitions === true;
  }

  async remember(input: MemoryRememberInput): Promise<MemoryRememberResult> {
    const skipped = (message: string): MemoryRememberResult => ({
      action: "skipped",
      id: null,
      title: null,
      candidates: [],
      message,
    });
    await this.ensureInitialized();
    if (!this.currentSettings().enabled) {
      return skipped(MEMORY_DISABLED_MESSAGE);
    }
    const content = redactMemorySecrets(input.content).trim();
    const title = redactMemorySecrets(input.title).trim();
    if (!content || !title) {
      return skipped("Memory content and title are required");
    }
    this.assertWritable([
      input.parentId,
      ...(input.mergeIds ?? []),
      ...(input.supersedes ?? []),
      ...(input.seeAlso ?? []),
    ]);
    const blocked = await this.readyProvider();
    if (blocked) return skipped(blocked);
    const result = await this.provider.remember({ ...input, content, title });
    if (result.action === "created" || result.action === "merged")
      this.broadcast();
    if (result.action !== "created" && result.message) {
      return { ...result, message: withIdentityHint(result.message) };
    }
    return result;
  }

  async list(input: MemoryListInput = {}): Promise<MemoryListResult> {
    const blocked = await this.readyProvider();
    if (blocked) return { items: [], error: blocked };
    const limit = Math.min(500, Math.max(1, Math.floor(input.limit ?? 50)));
    try {
      const items = await this.provider.list({
        limit,
        since: input.since ?? null,
        project: input.partition
          ? memoryPartitionProject(input.partition)
          : null,
      });
      return { items, error: null };
    } catch (error) {
      return { items: [], error: withIdentityHint(errorMessage(error)) };
    }
  }

  async update(input: MemoryUpdateInput): Promise<MemoryEntry | null> {
    this.assertWritable([input.id]);
    const provider = await this.requireProvider();
    const title =
      input.title === undefined
        ? undefined
        : redactMemorySecrets(input.title).trim();
    const content =
      input.content === undefined
        ? undefined
        : redactMemorySecrets(input.content).trim();
    if (title === "" || content === "") {
      throw new Error("Memory content and title cannot be empty");
    }
    await provider.update({ ...input, title, content });
    this.broadcast();
    return (await provider.show(input.id)).entry;
  }

  async forget(id: string) {
    this.assertWritable([id]);
    const provider = await this.requireProvider();
    await provider.forget(id);
    this.broadcast();
  }

  async restore(id: string) {
    this.assertWritable([id]);
    const provider = await this.requireProvider();
    await provider.restore(id);
    this.broadcast();
  }

  async history(input: { id?: string | null; limit?: number } = {}) {
    const provider = await this.requireProvider();
    const limit = Math.min(500, Math.max(1, Math.floor(input.limit ?? 50)));
    return provider.history({ id: input.id ?? null, limit });
  }

  async revision(): Promise<string | null> {
    if (await this.readyProvider()) return null;
    return this.provider.revision().catch(() => null);
  }

  async capabilities(): Promise<MemoryProviderCapabilities | null> {
    if (await this.readyProvider()) return null;
    return this.provider.capabilities().catch(() => null);
  }

  async exportTo(file: string) {
    const provider = await this.requireProvider();
    await provider.exportTo(file);
  }

  async importFrom(file: string): Promise<MemoryImportResult> {
    const provider = await this.requireProvider();
    const result = await provider.importFrom(file);
    this.broadcast();
    return result;
  }

  async policy() {
    const blocked = await this.readyProvider();
    if (blocked) return blocked;
    if (this.policyCache) return this.policyCache;
    try {
      this.policyCache = await this.provider.policy();
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
    partitions: MemoryPartition[] | null = null,
    recentMessages: readonly MessageRecord[] = [],
  ): Promise<MemoryTurnContext | null> {
    await this.ensureInitialized();
    const settings = this.currentSettings();
    if (!this.isReadyForTurns()) return null;
    if (!settings.enabled) return null;
    if (mode === "agent" && !settings.agent.injectContext) return null;
    if (mode === "chat" && !settings.chat.recall) return null;
    const personal = session.sessionKind === "personal";
    const messageWithContext = personal
      ? [
          message,
          ...recentMessages
            .filter((item) => item.role === "user")
            .slice(-2)
            .map((item) => item.content),
        ].join("\n")
      : message;
    const query = buildMemoryRecallQuery({
      project: null,
      title: session.sessionKind === "personal" ? null : session.title,
      message: messageWithContext,
    });
    if (!query) return null;
    let result: MemoryRecallResult;
    try {
      result = await this.recallIn(
        {
          query,
          limit: 6,
          timeoutMs: this.options.turnRecallBudgetMs ?? TURN_RECALL_BUDGET_MS,
        },
        partitions,
      );
    } catch (error) {
      this.noteRecall(session.id, mode, "failed", errorMessage(error));
      logDaemonDiagnostic("warn", "memory.turnRecallFailed", {
        error: errorMessage(error),
        sessionId: session.id,
      });
      return null;
    }
    if (result.error) {
      this.noteRecall(session.id, mode, "failed", result.error);
      logDaemonDiagnostic("warn", "memory.turnRecallFailed", {
        error: result.error,
        sessionId: session.id,
      });
      if (result.items.length === 0) return null;
    }
    if (result.items.length === 0) {
      this.noteRecall(session.id, mode, "empty", null);
      return null;
    }
    if (!result.error) this.noteRecall(session.id, mode, "recalled", null);
    if (session.sessionKind === "personal") {
      const entries = new Map<string, MemoryEntry>();
      const deadline = performance.now() + CHAT_EXCERPT_BUDGET_MS;
      for (const item of result.items.slice(0, 3)) {
        const remaining = Math.floor(deadline - performance.now());
        if (remaining <= 0) break;
        try {
          const entry = await this.showIn(item.id, partitions, remaining);
          if (entry) entries.set(item.id, entry);
        } catch (error) {
          logDaemonDiagnostic("info", "memory.personaBodyUnavailable", {
            error: errorMessage(error),
          });
        }
      }
      return {
        brief: personaMemoryBrief(result.items, entries, settings.agent.tools),
        items: result.items,
      };
    }
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
      provider: this.provider.id,
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
      provider: this.provider.id,
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
    return this.remember({ ...input, force: true });
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
    if (!runtime?.modelId) return null;
    const { provider, model } = buildSnapshotProviderRecords(runtime);
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      SESSION_DIGEST_TIMEOUT_MS,
    );
    timer.unref?.();
    try {
      return await generatePiMemoryDigest({
        userDataPath: this.options.userDataPath,
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

  agentInstructions(hasTools: boolean, personal = false, hostRsrs = false) {
    if (!hasTools || !this.isEnabledSync()) return "";
    if (personal) return personaMemoryPolicy();
    const policy = buildAgentMemoryPolicy(true);
    return hostRsrs ? `${policy}\n\n${HOST_RSRS_NOTE}` : policy;
  }

  // The user's own rsrs setup can write an rsrs block into this agent's
  // global instructions; that block drives the `rsrs` command against the
  // user's own store, not the one Cocurdex keeps.
  async hostInstructsRsrs(agentType: string) {
    if (await this.readyProvider()) return false;
    const injected = await this.provider
      .injectedAgents()
      .catch((): string[] => []);
    return injected.includes(agentType);
  }

  async getCaptures(): Promise<MemoryCaptureMap> {
    await this.ensureInitialized();
    return readMemoryCaptures(this.options.state);
  }

  async getTurnMessages(sessionId: string): Promise<MessageRecord[]> {
    return this.options.state.listMessagesBySessionId(sessionId);
  }
}
