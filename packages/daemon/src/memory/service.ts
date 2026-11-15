import { realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  generatePiMemoryDigest,
  generatePiToldLedger,
} from "@cocurdex/agent-adapters";
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
  type MemoryLibrarySyncSummary,
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
  ReasonError,
  RSRS_CLI_VERSION,
  RSRS_MIN_CLI_VERSION,
  type RsrsCliAsset,
  redactMemorySecrets,
  rsrsCliAsset,
  rsrsLibcFor,
  rsrsVersionMeetsMinimum,
  type SessionRecord,
  withMemoryIdentityHint,
} from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../diagnostics";
import { getDefaultUserDataPath } from "../paths";
import { buildSnapshotProviderRecords } from "../provider/session-title";
import type { DaemonState } from "../state";
import { BuiltinMemoryProvider } from "./builtin-provider";
import {
  buildAgentMemoryPolicy,
  buildMemoryBrief,
  buildSessionDigestFallback,
  buildTranscriptForSummary,
  compactText as compactDigestText,
  conversationTurns,
} from "./digest";
import {
  installBlocked,
  installErrorNeedsUser,
  needsGlobalInstall,
  needsManagedInstall,
} from "./install-policy";
import {
  applyMemorySync,
  isEmptyMemorySync,
  planMemorySync,
  summarizeMemorySync,
} from "./library-sync";
import {
  PARTITION_UNAVAILABLE,
  readPartitionEntry,
  scopeRememberCandidates,
  validatePartitionRelations,
} from "./partition-access";
import { mergeRecallResults } from "./partition-recall";
import { personaMemoryBrief, personaMemoryPolicy } from "./persona-memory";
import type { MemoryProvider, MemoryTransferEntry } from "./provider";
import {
  createRsrsLocalKeys,
  exportRsrsKeys,
  installRsrsModel,
  installRsrsRuntime,
  loginRsrsAccount,
  logoutRsrs,
  parseRsrsCloudStatus,
  type RsrsCloudSummary,
  type RsrsExecutable,
  readRsrsDoctor,
  readRsrsStatus,
  readRsrsVersion,
  registerRsrsAccount,
  restartRsrsRuntime,
  startRsrsRuntime,
  writeRsrsAutosync,
} from "./rsrs";
import {
  allocateLoopbackPort,
  globalRsrsDataDir,
  installManagedRsrsCli,
  isFreshRsrsHome,
  prepareRsrsDataDir,
  type RsrsHome,
  readyRsrsModelDir,
  usesGlobalRsrsHome,
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
/** The whole pre-turn recall, bodies included, so memory never holds up a turn for long. */
const TURN_RECALL_BUDGET_MS = 3_000;
const SESSION_DIGEST_TIMEOUT_MS = 60_000;
const RSRS_SYNC_DELAY_MS = 5_000;
const RSRS_SYNC_POLL_MS = 10 * 60_000;

type MemoryState = Pick<
  DaemonState,
  | "getAppSetting"
  | "setAppSetting"
  | "getSession"
  | "listSessions"
  | "listMessagesBySessionId"
  | "listWorkspaces"
  | "memoryStore"
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
  installRetryDelaysMs?: readonly number[];
  turnRecallBudgetMs?: number;
  provider?: MemoryProvider;
  homeDir?: string;
  defaultUserDataPath?: string;
  now?: () => Date;
}

export interface MemoryTurnContext {
  brief: string | null;
  items: MemoryRecallItem[];
}

// A fresh store's first runtime start and model download fail transiently
// (the host is not answering yet, a download stalls), so setup retries in the
// same run instead of waiting for the next daemon start.
const INSTALL_RETRY_DELAYS_MS = [15_000, 60_000];
const SHUTDOWN_RUNTIME_STOP_TIMEOUT_MS = 8_000;

function abortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve();
    }, ms);
    const stop = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", stop, { once: true });
  });
}

function isIncompleteRuntimeMaintenance(message: string) {
  return message.includes("runtime maintenance is incomplete");
}

function installedStoreState(status: MemoryInstallState["status"]) {
  if (status === "installing") return "installing";
  return status === "failed" ? "failed" : "ready";
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

function globalHomeWithoutCliMessage(dataDir: string) {
  return `${dataDir} already holds rsrs data, but its CLI is missing from ${path.join(dataDir, "bin")}. Cocurdex does not change an rsrs it did not install: run \`rsrs runtime start\` with your rsrs to restore it, or move the folder aside to let Cocurdex set up a new one.`;
}

function hostLibc(): MemoryPlatform["libc"] {
  if (process.platform !== "linux") return undefined;
  const report = process.report?.getReport() as
    | { header?: { glibcVersionRuntime?: string } }
    | undefined;
  return rsrsLibcFor(report?.header?.glibcVersionRuntime);
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
  private readonly lifetime = new AbortController();
  private lastRecall: MemoryRecallStatus | null = null;
  private upgradeRequired: MemoryStatus["upgradeRequired"] = null;
  private readonly rsrs: RsrsMemoryProvider;
  private readonly userLibrary: UserRsrsLibrary;
  private builtinProvider: BuiltinMemoryProvider | null = null;
  private rsrsSync: Promise<MemoryLibrarySyncSummary> | null = null;
  private rsrsSyncTimer: NodeJS.Timeout | null = null;
  private rsrsSyncPoll: NodeJS.Timeout | null = null;
  private syncedRevisions: { local: string; rsrs: string | null } | null = null;
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
    this.userLibrary = new UserRsrsLibrary({
      dataDir: () => this.userLibraryDir(),
      now: () => this.now().getTime(),
    });
  }

  private get builtin() {
    this.builtinProvider ??= new BuiltinMemoryProvider({
      ...this.options.state.memoryStore,
      device: this.device,
      now: () => this.now(),
    });
    return this.builtinProvider;
  }

  // Memories live in the daemon's own store; rsrs, when the user turns it on,
  // is kept in step with it and widens recall.
  private get provider(): MemoryProvider {
    return this.options.provider ?? this.builtin;
  }

  private get usesRsrs() {
    return !this.options.provider && this.currentSettings().rsrs;
  }

  // The user's own rsrs home, unless it is the store Cocurdex manages.
  private async userLibraryDir() {
    const dataDir = globalRsrsDataDir(this.homeDir());
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
    return this.usesRsrs && this.currentSettings().userLibrary;
  }

  private homeDir() {
    return this.options.homeDir ?? os.homedir();
  }

  private rsrsHome(): Promise<RsrsHome> {
    this.homePromise ??= (async (): Promise<RsrsHome> => {
      const explicit = this.options.rsrsDataDir ?? rsrsDataDirFromEnv();
      const globalDir = globalRsrsDataDir(this.homeDir());
      const global =
        !explicit &&
        usesGlobalRsrsHome({
          userDataPath: this.options.userDataPath,
          defaultUserDataPath:
            this.options.defaultUserDataPath ?? getDefaultUserDataPath(),
          os: this.platform.os,
        });
      if (global) {
        const dataDir = await realpath(globalDir).catch(() => globalDir);
        return { kind: "global", dataDir };
      }
      const dataDir = await prepareRsrsDataDir(
        explicit ?? path.join(this.options.userDataPath, "rsrs"),
      );
      let rpcPort = await readRsrsRpcPort(this.options.state);
      if (!rpcPort) {
        rpcPort = await allocateLoopbackPort();
        await writeRsrsRpcPort(this.options.state, rpcPort);
      }
      const modelDir = explicit ? null : await readyRsrsModelDir(globalDir);
      return { kind: "isolated", dataDir, rpcPort, modelDir };
    })().catch((error: unknown) => {
      this.homePromise = null;
      throw error;
    });
    return this.homePromise;
  }

  private unsupportedMessage() {
    return `rsrs has no build for ${this.platform.os}/${this.platform.arch} yet, so memory runs without it on this machine.`;
  }

  private get supported() {
    return memoryPlatformSupportsRsrs(this.platform);
  }

  private async ensureInitialized() {
    if (!this.initialization) {
      this.initialization = (async () => {
        try {
          this.installState = await readMemoryInstallState(this.options.state);
          this.settings = await readMemorySettings(
            this.options.state,
            this.installState.status === "ready",
          );
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
        blockedPin: null,
        ownedHome: null,
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

  providerId() {
    return this.provider.id;
  }

  isReadyForTurns() {
    return this.currentSettings().enabled;
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
    const usedRsrs = previousSettings.enabled && previousSettings.rsrs;
    const usesRsrs = settings.enabled && settings.rsrs;
    if (settings.cliPath !== previousCliPath) this.rsrs.forgetExecutable();
    this.statusCache = null;
    this.broadcast();
    if (usesRsrs && (!usedRsrs || settings.cliPath !== previousCliPath)) {
      this.syncedRevisions = null;
      void this.prepareEnabledStore();
    }
    if (usedRsrs && !usesRsrs) {
      this.stopRsrsSync();
      void this.rsrs.stopRuntime();
    }
    return settings;
  }

  async initializeOnStartup() {
    if (this.startupPromise) return this.startupPromise;
    this.startupPromise = (async () => {
      await this.ensureInitialized();
      if (!this.currentSettings().enabled || !this.usesRsrs) return;
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
      this.startRsrsSync();
    })();
    return this.startupPromise;
  }

  // Runs in the background so turning memory on answers at once.
  private async prepareEnabledStore() {
    if (this.options.startRuntime === false || !this.usesRsrs) return;
    try {
      if (await this.needsInstall()) await this.install(true);
      else await this.rsrs.warmup(true);
      this.startRsrsSync();
    } catch (error) {
      logDaemonDiagnostic("info", "memory.prepareFailed", {
        error: errorMessage(error),
      });
    }
  }

  private async needsInstall() {
    const settings = this.currentSettings();
    const home = await this.rsrsHome();
    if (home.kind === "global") {
      const state = this.currentInstallState();
      return needsGlobalInstall({
        supported: this.supported,
        enabled: settings.enabled,
        customCli: Boolean(settings.cliPath),
        hasExecutable: (await this.resolveExecutable()) !== null,
        freshHome: await isFreshRsrsHome(home.dataDir),
        ownedHome: state.ownedHome === home.dataDir,
        blocked: installBlocked(state, RSRS_CLI_VERSION),
      });
    }
    const state = this.currentInstallState();
    return needsManagedInstall({
      supported: this.supported,
      enabled: settings.enabled,
      customCli: Boolean(settings.cliPath),
      installedVersion: state.version,
      pinnedVersion: RSRS_CLI_VERSION,
      hasExecutable: (await this.resolveExecutable()) !== null,
      blocked: installBlocked(state, RSRS_CLI_VERSION),
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

  private changed() {
    this.broadcast();
    this.scheduleRsrsSync();
  }

  private broadcast() {
    this.options.broadcast({ type: "data.changed", areas: ["memory"] });
  }

  async getStatus(refresh = false): Promise<MemoryStatus> {
    await this.ensureInitialized();
    const [status, userLibrary] = await Promise.all([
      this.computeStatus(refresh),
      this.usesRsrs
        ? this.userLibrary.status().catch(() => NO_USER_LIBRARY)
        : NO_USER_LIBRARY,
    ]);
    return {
      ...status,
      available: true,
      rsrsAvailable: this.usesRsrs && status.available,
      userLibrary,
      lastRecall: this.lastRecall,
    };
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
    if (!this.usesRsrs) {
      const status = this.selfContainedStatus(settings);
      this.statusCache = { status, at: now };
      return status;
    }
    const installState = this.currentInstallState();
    const executable = await this.resolveExecutable(refresh);
    if (this.installPromise && installState.status === "installing") {
      // Setup keeps the runtime busy, so probing it now only times out.
      const status: MemoryStatus = {
        settings,
        rsrsAvailable: false,
        enabled: settings.enabled,
        supported: this.supported,
        available: false,
        installation: "installing",
        version: null,
        runtimeVersion: null,
        executable: executable?.command ?? null,
        dataDir: null,
        account: null,
        space: null,
        cloud: { ...DEFAULT_MEMORY_CLOUD_STATUS, autosync: false },
        doctor: null,
        error: null,
        checkedAt: installState.attemptedAt,
        lastRecall: null,
        userLibrary: NO_USER_LIBRARY,
      };
      this.statusCache = { status, at: now };
      return status;
    }
    if (!executable) {
      // A report from an older managed CLI describes a store this release no
      // longer uses.
      const pinned = installState.version === RSRS_CLI_VERSION;
      const status: MemoryStatus = {
        settings,
        rsrsAvailable: false,
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
        runtimeVersion: null,
        dataDir: null,
        account: null,
        space: null,
        cloud: { ...DEFAULT_MEMORY_CLOUD_STATUS, autosync: false },
        doctor: pinned ? installState.doctor : null,
        error: installState.error ?? (await this.globalHomeProblem()),
        checkedAt: installState.attemptedAt,
        lastRecall: null,
        userLibrary: NO_USER_LIBRARY,
      };
      this.statusCache = { status, at: now };
      return status;
    }
    const runtimeStatus = await this.runtimeStatus(executable);
    if (runtimeStatus) {
      this.statusCache = { status: runtimeStatus, at: now };
      return runtimeStatus;
    }
    const [versionResult, statusResult] = await Promise.allSettled([
      readRsrsVersion(executable, 4_000),
      readRsrsStatus(executable, 20_000),
    ]);
    const version =
      versionResult.status === "fulfilled" ? versionResult.value : null;
    this.noteVersion(version);
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
      rsrsAvailable: false,
      enabled: settings.enabled,
      supported: this.supported,
      available: true,
      installation: installedStoreState(installState.status),
      version,
      runtimeVersion: null,
      executable: executable.command,
      dataDir: summary?.dataDir ?? null,
      account: summary?.account ?? null,
      space: summary?.space ?? null,
      cloud: toCloudStatus(summary),
      doctor:
        installState.doctor?.version === version ? installState.doctor : null,
      error:
        error ??
        (summary ? memoryStatusError(summary) : null) ??
        (installState.status === "failed" ? installState.error : null),
      upgradeRequired: this.upgradeRequired,
      checkedAt: this.now().toISOString(),
      lastRecall: null,
      userLibrary: NO_USER_LIBRARY,
    };
    this.statusCache = { status, at: now };
    return status;
  }

  private selfContainedStatus(settings: MemorySettings): MemoryStatus {
    return {
      settings,
      rsrsAvailable: false,
      enabled: settings.enabled,
      supported: this.supported,
      available: false,
      installation: "missing",
      version: null,
      runtimeVersion: null,
      executable: null,
      dataDir: null,
      account: null,
      space: null,
      cloud: { ...DEFAULT_MEMORY_CLOUD_STATUS, autosync: false },
      doctor: null,
      error: null,
      checkedAt: this.now().toISOString(),
      lastRecall: null,
      userLibrary: NO_USER_LIBRARY,
    };
  }

  private assertUsesRsrs() {
    if (this.usesRsrs) return;
    throw new ReasonError(
      "memory.rsrsOff",
      "Memory works without rsrs. Installation, health checks, and accounts belong to rsrs: turn it on in Settings > Memory, or run: cocurdex memory rsrs on.",
    );
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
    this.assertUsesRsrs();
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
        blockedPin: null,
      });
      try {
        const executable = await this.setUpRsrsWithRetries();
        this.policyCache = null;
        const version = await readRsrsVersion(executable).catch(() => null);
        const doctor = await readRsrsDoctor(executable);
        await this.persistInstallState({
          attemptedAt: this.now().toISOString(),
          status: "ready",
          version: version ?? doctor.report.version,
          executable: executable.command,
          error: null,
          doctor: {
            ...doctor.report,
            version: version ?? doctor.report.version,
          },
          blockedPin: null,
          ownedHome: this.currentInstallState().ownedHome,
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
        if (this.lifetime.signal.aborted) {
          await this.persistInstallState({
            ...this.currentInstallState(),
            status: "idle",
          });
          return { status: await this.getStatus(), installed: false, message };
        }
        await this.persistInstallState({
          ...this.currentInstallState(),
          attemptedAt: this.now().toISOString(),
          status: "failed",
          error: message,
          blockedPin: installErrorNeedsUser(message) ? RSRS_CLI_VERSION : null,
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

  private async setUpRsrsWithRetries() {
    const signal = this.lifetime.signal;
    const delays = this.options.installRetryDelaysMs ?? INSTALL_RETRY_DELAYS_MS;
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.setUpRsrs(signal);
      } catch (error) {
        const delay = delays[attempt];
        if (signal.aborted || delay === undefined) throw error;
        if (installErrorNeedsUser(errorMessage(error))) throw error;
        logDaemonDiagnostic("info", "memory.installRetry", {
          attempt: attempt + 1,
          error: errorMessage(error),
        });
        await abortableDelay(delay, signal);
        if (isIncompleteRuntimeMaintenance(errorMessage(error))) {
          await this.restartRuntimeForRecovery();
        }
      }
    }
  }

  // rsrs refuses library access after an interrupted runtime maintenance
  // (respire-cli autostart/lifecycle.rs) until the host restarts the runtime.
  private async restartRuntimeForRecovery() {
    if (!(await this.rsrs.ownsRuntime())) return;
    const executable = await this.resolveExecutable(true);
    if (!executable) return;
    await restartRsrsRuntime(executable).catch((error: unknown) => {
      logDaemonDiagnostic("info", "memory.runtimeRestartFailed", {
        error: errorMessage(error),
      });
    });
    this.rsrs.invalidateRuntime();
  }

  // Stops the private store's runtime so no rsrs process outlives the daemon,
  // within the window clients give a stopping daemon. A setup step in flight
  // is left to finish: model install restarts the runtime for maintenance, and
  // interrupting it leaves the store refusing access until a runtime restart.
  async shutdown() {
    this.lifetime.abort(new Error("The daemon is shutting down"));
    this.stopRsrsSync();
    if (this.installPromise || this.options.startRuntime === false) return;
    await this.rsrs.stopRuntime(SHUTDOWN_RUNTIME_STOP_TIMEOUT_MS);
  }

  // Order matters with rsrs 2.x: the runtime host runs from the managed CLI,
  // keygen needs a running host, and `runtime start` completes the key
  // handoff (respire-cli#277).
  private async setUpRsrs(signal: AbortSignal) {
    const asset = rsrsCliAsset(this.platform);
    if (!asset) throw new Error(this.unsupportedMessage());
    if (!this.currentSettings().cliPath) await this.installCli(asset);
    const executable = await this.resolveExecutable(true);
    if (!executable) throw new Error(MEMORY_MISSING_EXECUTABLE_MESSAGE);
    this.rsrs.adoptExecutable(executable);
    signal.throwIfAborted();
    await installRsrsRuntime(executable);
    signal.throwIfAborted();
    const summary = await readRsrsStatus(executable, 120_000);
    if (!summary.hasKeys) {
      signal.throwIfAborted();
      await createRsrsLocalKeys(executable);
      await startRsrsRuntime(executable);
    }
    signal.throwIfAborted();
    await installRsrsModel(executable);
    this.rsrs.invalidateRuntime();
    return executable;
  }

  private async globalHomeProblem() {
    if (this.currentSettings().cliPath) return null;
    const home = await this.rsrsHome().catch(() => null);
    if (home?.kind !== "global") return null;
    if (this.currentInstallState().ownedHome === home.dataDir) return null;
    return (await isFreshRsrsHome(home.dataDir))
      ? null
      : globalHomeWithoutCliMessage(home.dataDir);
  }

  private async installCli(asset: RsrsCliAsset) {
    const home = await this.rsrsHome();
    if (home.kind === "isolated") {
      const managed = await installManagedRsrsCli({
        dataDir: home.dataDir,
        os: this.platform.os,
        asset,
        beforeReplace: () => this.rsrs.stopRuntime(),
      });
      logDaemonDiagnostic("info", "memory.cliInstalled", {
        replaced: managed.replaced,
      });
      return;
    }
    if (await this.resolveExecutable(true)) return;
    const owned = this.currentInstallState().ownedHome === home.dataDir;
    if (!owned && !(await isFreshRsrsHome(home.dataDir))) {
      throw new Error(globalHomeWithoutCliMessage(home.dataDir));
    }
    await prepareRsrsDataDir(home.dataDir);
    await this.persistInstallState({
      ...this.currentInstallState(),
      ownedHome: home.dataDir,
    });
    await installManagedRsrsCli({
      dataDir: home.dataDir,
      os: this.platform.os,
      asset,
    });
    logDaemonDiagnostic("info", "memory.cliInstalled", { replaced: false });
  }

  async doctor(options: { remote?: boolean; checkUpdate?: boolean } = {}) {
    await this.ensureInitialized();
    this.assertUsesRsrs();
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
        doctor: { ...result.report, version },
        blockedPin: this.currentInstallState().blockedPin,
        ownedHome: this.currentInstallState().ownedHome,
      });
      return result.report;
    })().finally(() => {
      this.doctorPromise = null;
    });
    return this.doctorPromise;
  }

  private async cloudExecutable() {
    this.assertUsesRsrs();
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
      throw new ReasonError(
        "memory.invalidUsername",
        "Username must be at least 3 characters",
      );
    }
    if (password.length < 8) {
      throw new ReasonError(
        "memory.invalidPassword",
        "Login password must be at least 8 characters",
      );
    }
    if (input.mode === "signin" && !recoveryKey) {
      throw new ReasonError(
        "memory.recoveryKeyRequired",
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
        throw new ReasonError(
          "memory.cloudAccountRequired",
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
    executable: RsrsExecutable,
  ): Promise<MemoryStatus | null> {
    const runtime = await this.rsrs.runtimeStatus();
    if (!runtime) return null;
    const cloudSummary = parseRsrsCloudStatus(runtime.payload);
    const settings = this.currentSettings();
    const installState = this.currentInstallState();
    const version = await readRsrsVersion(executable, 4_000).catch(() => null);
    this.noteVersion(version);
    const failed = installState.status === "failed";
    const blocked = installBlocked(installState, RSRS_CLI_VERSION);
    return {
      settings,
      rsrsAvailable: false,
      enabled: settings.enabled,
      supported: this.supported,
      available: true,
      installation:
        installState.status === "installing"
          ? "installing"
          : failed && !blocked
            ? "failed"
            : "ready",
      version,
      runtimeVersion: runtime.runtimeVersion,
      executable: executable.command,
      dataDir: cloudSummary.dataDir,
      account: cloudSummary.account,
      space: cloudSummary.space,
      cloud: toCloudStatus(cloudSummary),
      doctor:
        version && installState.doctor?.version === version
          ? installState.doctor
          : null,
      error:
        (failed ? installState.error : null) ?? memoryStatusError(cloudSummary),
      installBlocked: blocked,
      upgradeRequired: this.upgradeRequired,
      checkedAt: this.now().toISOString(),
      lastRecall: null,
      userLibrary: NO_USER_LIBRARY,
    };
  }

  private noteVersion(version: string | null) {
    const tooOld = version !== null && !rsrsVersionMeetsMinimum(version);
    this.upgradeRequired = tooOld
      ? { installed: version, minimum: RSRS_MIN_CLI_VERSION }
      : null;
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
    const [own, widened, reference] = await Promise.all([
      this.provider.recall({
        query,
        limit,
        project,
        timeoutMs: input.timeoutMs,
      }),
      this.recallRsrs({ query, limit, project, timeoutMs: input.timeoutMs }),
      project ? [] : this.recallUserLibrary(query, limit, input.timeoutMs),
    ]);
    const result = mergeRecallResults(
      [
        { query, truncated: false, ...own },
        { query, truncated: false, items: widened, error: null },
      ],
      limit * 2,
    );
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

  // rsrs ranks by meaning where the built-in store matches words. Its hits
  // are reported under the store's own ids; one the store lacks is still
  // readable through rsrs until the next sync brings it in.
  private async recallRsrs(input: {
    query: string;
    limit: number;
    project: string | null;
    timeoutMs?: number;
  }): Promise<MemoryRecallItem[]> {
    if (!this.usesRsrs || this.upgradeRequired) return [];
    try {
      if (!(await this.rsrs.available())) return [];
      const result = await this.rsrs.recall(input);
      if (result.error) throw new Error(result.error);
      const entries = this.options.state.memoryStore.entries;
      let unknown = false;
      const items = result.items.flatMap((item) => {
        const local = entries.findByRemoteId(item.id);
        if (local?.deletedAt) return [];
        if (!local) unknown = true;
        return [{ ...item, id: local?.id ?? item.id }];
      });
      if (unknown) this.scheduleRsrsSync();
      return items;
    } catch (error) {
      logDaemonDiagnostic("info", "memory.rsrsRecallFailed", {
        error: errorMessage(error),
      });
      return [];
    }
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
      throw new ReasonError(
        "memory.userLibraryReadOnly",
        USER_LIBRARY_READ_ONLY,
      );
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
    return result.entry ?? this.showFromRsrs(id, timeoutMs);
  }

  private async showFromRsrs(id: string, timeoutMs?: number) {
    if (!this.usesRsrs || this.upgradeRequired) return null;
    if (this.options.state.memoryStore.entries.find(id)) return null;
    try {
      if (!(await this.rsrs.available())) return null;
      return (await this.rsrs.show(id, timeoutMs)).entry;
    } catch (error) {
      logDaemonDiagnostic("info", "memory.rsrsShowFailed", {
        error: errorMessage(error),
      });
      return null;
    }
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
      this.changed();
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
    this.changed();
    return (await provider.show(input.id)).entry;
  }

  async forget(id: string) {
    this.assertWritable([id]);
    const provider = await this.requireProvider();
    await provider.forget(id);
    this.changed();
  }

  async restore(id: string) {
    this.assertWritable([id]);
    const provider = await this.requireProvider();
    await provider.restore(id);
    this.changed();
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
    this.changed();
    return result;
  }

  private async runRsrsSync(apply: boolean) {
    await this.ensureInitialized();
    if (!this.usesRsrs) {
      throw new ReasonError(
        "memory.rsrsOff",
        "rsrs is off, so there is nothing to sync with. Turn it on in Settings > Memory, or run: cocurdex memory rsrs on.",
      );
    }
    if (!(await this.rsrs.available())) {
      throw new ReasonError(
        "memory.rsrsUnavailable",
        MEMORY_MISSING_EXECUTABLE_MESSAGE,
      );
    }
    const store = this.options.state.memoryStore;
    const revisions = async () => ({
      local: String(store.entries.revision()),
      rsrs: await this.rsrs.revision().catch(() => null),
    });
    const before = await revisions();
    const settled =
      before.rsrs !== null &&
      before.local === this.syncedRevisions?.local &&
      before.rsrs === this.syncedRevisions?.rsrs;
    if (settled) return summarizeMemorySync(planMemorySync([], []));
    let library: MemoryTransferEntry[];
    try {
      library = await this.rsrs.snapshot();
    } catch (error) {
      throw new ReasonError(
        "memory.rsrsUnavailable",
        `rsrs could not list its memories: ${errorMessage(error)}`,
        { cause: error },
      );
    }
    const plan = planMemorySync(store.entries.all(), library);
    if (!apply) return summarizeMemorySync(plan);
    const failed = await applyMemorySync(plan, {
      builtin: this.builtin,
      entries: store.entries,
      transaction: store.transaction,
      external: this.rsrs,
      now: () => this.now(),
    });
    this.syncedRevisions = failed === 0 ? await revisions() : null;
    if (!isEmptyMemorySync(plan)) this.broadcast();
    return summarizeMemorySync(plan, failed);
  }

  /** What a sync with rsrs would change, without changing it. */
  previewRsrsSync(): Promise<MemoryLibrarySyncSummary> {
    return this.runRsrsSync(false);
  }

  syncRsrs(): Promise<MemoryLibrarySyncSummary> {
    this.rsrsSync ??= this.runRsrsSync(true).finally(() => {
      this.rsrsSync = null;
    });
    return this.rsrsSync;
  }

  private backgroundRsrsSync() {
    if (this.lifetime.signal.aborted || !this.usesRsrs) return;
    this.syncRsrs().catch((error: unknown) => {
      logDaemonDiagnostic("info", "memory.rsrsSyncFailed", {
        error: errorMessage(error),
      });
    });
  }

  private scheduleRsrsSync() {
    if (!this.usesRsrs || this.options.startRuntime === false) return;
    if (this.rsrsSyncTimer || this.lifetime.signal.aborted) return;
    this.rsrsSyncTimer = setTimeout(() => {
      this.rsrsSyncTimer = null;
      this.backgroundRsrsSync();
    }, RSRS_SYNC_DELAY_MS);
    this.rsrsSyncTimer.unref?.();
  }

  // Memories other devices add reach this one through rsrs's own sync, so the
  // library is read again from time to time, not only after a local write.
  private startRsrsSync() {
    if (!this.usesRsrs || this.options.startRuntime === false) return;
    this.scheduleRsrsSync();
    if (this.rsrsSyncPoll) return;
    this.rsrsSyncPoll = setInterval(
      () => this.backgroundRsrsSync(),
      RSRS_SYNC_POLL_MS,
    );
    this.rsrsSyncPoll.unref?.();
  }

  private stopRsrsSync() {
    if (this.rsrsSyncTimer) clearTimeout(this.rsrsSyncTimer);
    if (this.rsrsSyncPoll) clearInterval(this.rsrsSyncPoll);
    this.rsrsSyncTimer = null;
    this.rsrsSyncPoll = null;
    this.syncedRevisions = null;
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
      title: personal || mode === "chat" ? null : session.title,
      message: messageWithContext,
    });
    if (!query) return null;
    const budgetMs = this.options.turnRecallBudgetMs ?? TURN_RECALL_BUDGET_MS;
    const deadline = performance.now() + budgetMs;
    const remainingMs = () => Math.floor(deadline - performance.now());
    let result: MemoryRecallResult;
    try {
      result = await this.recallIn(
        { query, limit: 6, timeoutMs: budgetMs },
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
    const ownDiary = (await readMemoryCaptures(this.options.state))[session.id];
    result = {
      ...result,
      items: result.items.filter((item) => item.id !== ownDiary?.memoryId),
    };
    if (result.items.length === 0) {
      this.noteRecall(session.id, mode, "empty", null);
      return null;
    }
    if (!result.error) this.noteRecall(session.id, mode, "recalled", null);
    if (session.sessionKind === "personal") {
      const entries = new Map<string, MemoryEntry>();
      for (const item of result.items.slice(0, 3)) {
        const remaining = remainingMs();
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
    if (mode === "chat" && remainingMs() > 0) {
      const selected = result.items.slice(0, 2);
      const shown = await Promise.all(
        selected.map(async (item) => {
          try {
            const entry = await this.show(item.id, remainingMs());
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
    if (!(await this.provider.available())) {
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

  async summarizeTold(
    session: SessionRecord,
    items: readonly string[],
    transcript: string,
    maxItems: number,
  ): Promise<string[] | null> {
    const runtime = await this.options.resolveSessionProvider(session);
    if (!runtime?.modelId) return null;
    const { provider, model } = buildSnapshotProviderRecords(runtime);
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      SESSION_DIGEST_TIMEOUT_MS,
    );
    timer.unref?.();
    try {
      return await generatePiToldLedger({
        userDataPath: this.options.userDataPath,
        provider,
        model,
        apiKey: runtime.apiKey ?? null,
        items,
        transcript: redactMemorySecrets(transcript),
        maxItems,
        sessionId: session.id,
        signal: controller.signal,
      });
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
    if ((await this.readyProvider()) || !this.usesRsrs) return false;
    if (!(await this.rsrs.available().catch(() => false))) return false;
    const injected = await this.rsrs.injectedAgents().catch((): string[] => []);
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
