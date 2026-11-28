import { realpath } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_MEMORY_CLOUD_STATUS,
  MEMORY_MISSING_EXECUTABLE_MESSAGE,
  type MemoryCloudStatus,
  type MemoryDoctorReport,
  type MemoryPlatform,
  type MemoryRecallItem,
  type MemorySettings,
  type MemoryStatus,
  type MemoryUserLibraryStatus,
  memoryPlatformSupportsRsrs,
  RSRS_CLI_VERSION,
  RSRS_MIN_CLI_VERSION,
  type RsrsCliAsset,
  rsrsCliAsset,
  rsrsVersionMeetsMinimum,
} from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../../diagnostics";
import {
  installBlocked,
  installErrorNeedsUser,
  needsGlobalInstall,
  needsManagedInstall,
} from "../install-policy";
import {
  createRsrsLocalKeys,
  installRsrsModel,
  installRsrsRuntime,
  parseRsrsCloudStatus,
  type RsrsCloudSummary,
  type RsrsExecutable,
  readRsrsDoctor,
  readRsrsStatus,
  readRsrsVersion,
  restartRsrsRuntime,
  startRsrsRuntime,
} from "../rsrs";
import {
  allocateLoopbackPort,
  globalRsrsDataDir,
  installManagedRsrsCli,
  isFreshRsrsHome,
  prepareRsrsDataDir,
  type RsrsHome,
  readyRsrsModelDir,
  usesGlobalRsrsHome,
} from "../rsrs-install";
import { RsrsMemoryProvider } from "../rsrs-provider";
import {
  type MemoryInstallState,
  type MemorySettingsStore,
  readMemoryInstallState,
  readRsrsRpcPort,
  writeMemoryInstallState,
  writeRsrsRpcPort,
} from "../settings";
import { memoryStatusError } from "../status-health";
import { UserRsrsLibrary } from "../user-library";
import type { ExternalMemory } from "./types";

const STATUS_CACHE_MS = 30_000;
// A fresh store's first runtime start and model download fail transiently
// (the host is not answering yet, a download stalls), so setup retries in the
// same run instead of waiting for the next daemon start.
const INSTALL_RETRY_DELAYS_MS = [15_000, 60_000];
const SHUTDOWN_RUNTIME_STOP_TIMEOUT_MS = 8_000;
export const NO_USER_LIBRARY: MemoryUserLibraryStatus = {
  detected: false,
  reachable: false,
};
const HOST_RSRS_NOTE =
  "Your global instructions may also tell you to run the `rsrs` command (rsrs recall, rsrs remember). Inside Cocurdex, the memory tools above are the long-term memory: use them for every recall and store, and do not run the `rsrs` command.";

/** The rsrs-specific part of `MemoryStatus`, without what the service adds. */
export type RsrsStatusFields = Omit<
  MemoryStatus,
  "settings" | "provider" | "lastRecall" | "userLibrary" | "rsrsAvailable"
>;

const IDLE_INSTALL_STATE: MemoryInstallState = {
  attemptedAt: null,
  status: "idle",
  version: null,
  executable: null,
  error: null,
  doctor: null,
  blockedPin: null,
  ownedHome: null,
};

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

export function idleRsrsStatusFields(
  settings: MemorySettings,
  supported: boolean,
  checkedAt: string,
): RsrsStatusFields {
  return {
    enabled: settings.enabled,
    supported,
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
    checkedAt,
  };
}

export interface RsrsExternalOptions {
  userDataPath: string;
  state: MemorySettingsStore;
  settings(): MemorySettings;
  platform: MemoryPlatform;
  homeDir(): string;
  defaultUserDataPath(): string;
  rsrsDataDir?: string;
  startRuntime?: boolean;
  installRetryDelaysMs?: readonly number[];
  lifetime: AbortSignal;
  now(): Date;
  /** Install state or status changed. */
  changed(): void;
}

export class RsrsExternal implements ExternalMemory {
  readonly id = "rsrs" as const;
  readonly library: RsrsMemoryProvider;
  private readonly userLibrary: UserRsrsLibrary;
  private installState: MemoryInstallState | null = null;
  private initialization: Promise<void> | null = null;
  private homePromise: Promise<RsrsHome> | null = null;
  private installPromise: Promise<{
    installed: boolean;
    message: string | null;
  }> | null = null;
  private doctorPromise: Promise<MemoryDoctorReport> | null = null;
  private statusCache: { status: RsrsStatusFields; at: number } | null = null;
  private upgradeRequired: MemoryStatus["upgradeRequired"] = null;

  constructor(private readonly options: RsrsExternalOptions) {
    this.library = new RsrsMemoryProvider({
      settings: () => options.settings(),
      home: () => this.home(),
      os: options.platform.os,
      startRuntime: options.startRuntime,
      now: () => options.now(),
    });
    this.userLibrary = new UserRsrsLibrary({
      dataDir: () => this.userLibraryDir(),
      now: () => options.now().getTime(),
    });
  }

  get supported() {
    return memoryPlatformSupportsRsrs(this.options.platform);
  }

  unsupportedMessage() {
    const { os, arch } = this.options.platform;
    return `rsrs has no build for ${os}/${arch} yet, so memory runs without it on this machine.`;
  }

  private async ensureInitialized() {
    this.initialization ??= readMemoryInstallState(this.options.state)
      .then((state) => {
        this.installState = state;
      })
      .catch((error: unknown) => {
        logDaemonDiagnostic("warn", "memory.initializeFailed", {
          error: errorMessage(error),
        });
      });
    await this.initialization;
  }

  private currentInstallState(): MemoryInstallState {
    return this.installState ?? IDLE_INSTALL_STATE;
  }

  private changed() {
    this.statusCache = null;
    this.options.changed();
  }

  private home(): Promise<RsrsHome> {
    this.homePromise ??= (async (): Promise<RsrsHome> => {
      const explicit = this.options.rsrsDataDir ?? rsrsDataDirFromEnv();
      const globalDir = globalRsrsDataDir(this.options.homeDir());
      const global =
        !explicit &&
        usesGlobalRsrsHome({
          userDataPath: this.options.userDataPath,
          defaultUserDataPath: this.options.defaultUserDataPath(),
          os: this.options.platform.os,
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

  // The user's own rsrs home, unless it is the store Cocurdex manages.
  private async userLibraryDir() {
    const dataDir = globalRsrsDataDir(this.options.homeDir());
    const own = await this.home().catch(() => null);
    if (!own) return null;
    const user = await realpath(dataDir).catch(() => null);
    if (!user) return null;
    const { os } = this.options.platform;
    const caseInsensitive = os === "win32" || os === "darwin";
    const same = caseInsensitive
      ? user.toLowerCase() === own.dataDir.toLowerCase()
      : user === own.dataDir;
    return same ? null : user;
  }

  private userLibraryEnabled() {
    return this.options.settings().providers.rsrs.userLibrary;
  }

  async start(reason: "startup" | "chosen") {
    await this.ensureInitialized();
    if (reason === "chosen" && this.options.startRuntime === false) return;
    if (
      reason === "startup" &&
      this.currentInstallState().status === "installing"
    ) {
      await this.persistInstallState({
        ...this.currentInstallState(),
        status: "idle",
      });
    }
    if (await this.needsInstall()) {
      if (reason === "startup") void this.install(true);
      else await this.install(true);
      return;
    }
    await this.library.warmup(reason === "chosen");
  }

  async stop() {
    await this.library.stopRuntime();
  }

  // Stops the private store's runtime so no rsrs process outlives the daemon,
  // within the window clients give a stopping daemon. A setup step in flight
  // is left to finish: model install restarts the runtime for maintenance, and
  // interrupting it leaves the store refusing access until a runtime restart.
  async shutdown() {
    if (this.installPromise || this.options.startRuntime === false) return;
    await this.library.stopRuntime(SHUTDOWN_RUNTIME_STOP_TIMEOUT_MS);
  }

  settingsChanged(previous: MemorySettings, next: MemorySettings) {
    if (previous.providers.rsrs.cliPath !== next.providers.rsrs.cliPath) {
      this.library.forgetExecutable();
    }
    this.statusCache = null;
  }

  async usable() {
    if (this.upgradeRequired) return false;
    return this.library.available().catch(() => false);
  }

  private async needsInstall() {
    const settings = this.options.settings();
    const home = await this.home();
    const state = this.currentInstallState();
    const customCli = Boolean(settings.providers.rsrs.cliPath);
    const hasExecutable = (await this.resolveExecutable()) !== null;
    const blocked = installBlocked(state, RSRS_CLI_VERSION);
    if (home.kind === "global") {
      return needsGlobalInstall({
        supported: this.supported,
        enabled: settings.enabled,
        customCli,
        hasExecutable,
        freshHome: await isFreshRsrsHome(home.dataDir),
        ownedHome: state.ownedHome === home.dataDir,
        blocked,
      });
    }
    return needsManagedInstall({
      supported: this.supported,
      enabled: settings.enabled,
      customCli,
      installedVersion: state.version,
      pinnedVersion: RSRS_CLI_VERSION,
      hasExecutable,
      blocked,
    });
  }

  private async resolveExecutable(force = false) {
    await this.ensureInitialized();
    return this.library.executable(force);
  }

  private async persistInstallState(state: MemoryInstallState) {
    this.installState = state;
    try {
      await writeMemoryInstallState(this.options.state, state);
    } catch (error) {
      logDaemonDiagnostic("warn", "memory.installStateWriteFailed", {
        error: errorMessage(error),
      });
    }
    this.changed();
  }

  /** Installs rsrs; `force` sets it up again even when it looks ready. */
  async install(force = false) {
    await this.ensureInitialized();
    if (!this.supported) {
      return { installed: false, message: this.unsupportedMessage() };
    }
    if (this.installPromise) return this.installPromise;
    if (!force) {
      const state = this.currentInstallState();
      if (state.status === "ready" && (await this.resolveExecutable())) {
        this.statusCache = null;
        return { installed: true, message: null };
      }
    }
    this.installPromise = this.runInstall().finally(() => {
      this.installPromise = null;
      this.statusCache = null;
    });
    return this.installPromise;
  }

  private async runInstall() {
    await this.persistInstallState({
      ...this.currentInstallState(),
      attemptedAt: this.options.now().toISOString(),
      status: "installing",
      error: null,
      blockedPin: null,
    });
    try {
      const executable = await this.setUpWithRetries();
      const version = await readRsrsVersion(executable).catch(() => null);
      const doctor = await readRsrsDoctor(executable);
      await this.persistInstallState({
        attemptedAt: this.options.now().toISOString(),
        status: "ready",
        version: version ?? doctor.report.version,
        executable: executable.command,
        error: null,
        doctor: { ...doctor.report, version: version ?? doctor.report.version },
        blockedPin: null,
        ownedHome: this.currentInstallState().ownedHome,
      });
      if (this.options.settings().enabled) void this.library.warmup();
      return {
        installed: doctor.installed,
        message: doctor.installed
          ? null
          : "rsrs is installed but doctor reported a failing critical check",
      };
    } catch (error) {
      const message = errorMessage(error);
      if (this.options.lifetime.aborted) {
        await this.persistInstallState({
          ...this.currentInstallState(),
          status: "idle",
        });
        return { installed: false, message };
      }
      await this.persistInstallState({
        ...this.currentInstallState(),
        attemptedAt: this.options.now().toISOString(),
        status: "failed",
        error: message,
        blockedPin: installErrorNeedsUser(message) ? RSRS_CLI_VERSION : null,
      });
      logDaemonDiagnostic("warn", "memory.installFailed", { error: message });
      return { installed: false, message };
    }
  }

  private async setUpWithRetries() {
    const signal = this.options.lifetime;
    const delays = this.options.installRetryDelaysMs ?? INSTALL_RETRY_DELAYS_MS;
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.setUp(signal);
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
    if (!(await this.library.ownsRuntime())) return;
    const executable = await this.resolveExecutable(true);
    if (!executable) return;
    await restartRsrsRuntime(executable).catch((error: unknown) => {
      logDaemonDiagnostic("info", "memory.runtimeRestartFailed", {
        error: errorMessage(error),
      });
    });
    this.library.invalidateRuntime();
  }

  // Order matters with rsrs 2.x: the runtime host runs from the managed CLI,
  // keygen needs a running host, and `runtime start` completes the key
  // handoff (respire-cli#277).
  private async setUp(signal: AbortSignal) {
    const asset = rsrsCliAsset(this.options.platform);
    if (!asset) throw new Error(this.unsupportedMessage());
    if (!this.options.settings().providers.rsrs.cliPath) {
      await this.installCli(asset);
    }
    const executable = await this.resolveExecutable(true);
    if (!executable) throw new Error(MEMORY_MISSING_EXECUTABLE_MESSAGE);
    this.library.adoptExecutable(executable);
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
    this.library.invalidateRuntime();
    return executable;
  }

  private async globalHomeProblem() {
    if (this.options.settings().providers.rsrs.cliPath) return null;
    const home = await this.home().catch(() => null);
    if (home?.kind !== "global") return null;
    if (this.currentInstallState().ownedHome === home.dataDir) return null;
    return (await isFreshRsrsHome(home.dataDir))
      ? null
      : globalHomeWithoutCliMessage(home.dataDir);
  }

  private async installCli(asset: RsrsCliAsset) {
    const home = await this.home();
    const os = this.options.platform.os;
    if (home.kind === "isolated") {
      const managed = await installManagedRsrsCli({
        dataDir: home.dataDir,
        os,
        asset,
        beforeReplace: () => this.library.stopRuntime(),
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
    await installManagedRsrsCli({ dataDir: home.dataDir, os, asset });
    logDaemonDiagnostic("info", "memory.cliInstalled", { replaced: false });
  }

  async doctor(options: { remote?: boolean; checkUpdate?: boolean } = {}) {
    await this.ensureInitialized();
    this.doctorPromise ??= (async () => {
      const executable = await this.resolveExecutable(true);
      if (!executable) throw new Error(MEMORY_MISSING_EXECUTABLE_MESSAGE);
      const result = await readRsrsDoctor(executable, options);
      const version = await readRsrsVersion(executable).catch(
        () => result.report.version,
      );
      await this.persistInstallState({
        attemptedAt: this.options.now().toISOString(),
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

  async status(refresh: boolean) {
    const fields = await this.statusFields(refresh);
    return {
      id: this.id,
      available: fields.available && !fields.upgradeRequired,
      preparing: fields.installation === "installing",
      version: fields.version,
      location: fields.dataDir,
      error: fields.error,
    };
  }

  /** What `MemoryStatus` reports about rsrs while it is the chosen library. */
  async statusFields(refresh = false): Promise<RsrsStatusFields> {
    await this.ensureInitialized();
    const now = this.options.now().getTime();
    if (
      !refresh &&
      this.statusCache &&
      now - this.statusCache.at < STATUS_CACHE_MS
    ) {
      return this.statusCache.status;
    }
    const status = await this.computeStatusFields(refresh);
    this.statusCache = { status, at: now };
    return status;
  }

  private async computeStatusFields(
    refresh: boolean,
  ): Promise<RsrsStatusFields> {
    const settings = this.options.settings();
    const installState = this.currentInstallState();
    const executable = await this.resolveExecutable(refresh);
    const base = idleRsrsStatusFields(
      settings,
      this.supported,
      this.options.now().toISOString(),
    );
    if (this.installPromise && installState.status === "installing") {
      // Setup keeps the runtime busy, so probing it now only times out.
      return {
        ...base,
        installation: "installing",
        executable: executable?.command ?? null,
        checkedAt: installState.attemptedAt,
      };
    }
    if (!executable) {
      // A report from an older managed CLI describes a store this release no
      // longer uses.
      const pinned = installState.version === RSRS_CLI_VERSION;
      return {
        ...base,
        installation:
          installState.status === "installing"
            ? "installing"
            : installState.status === "failed"
              ? "failed"
              : "missing",
        version: pinned ? installState.version : null,
        doctor: pinned ? installState.doctor : null,
        error: installState.error ?? (await this.globalHomeProblem()),
        checkedAt: installState.attemptedAt,
      };
    }
    const runtime = await this.runtimeStatusFields(executable, base);
    if (runtime) return runtime;
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
    return {
      ...base,
      available: true,
      installation: installedStoreState(installState.status),
      version,
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
    };
  }

  private async runtimeStatusFields(
    executable: RsrsExecutable,
    base: RsrsStatusFields,
  ): Promise<RsrsStatusFields | null> {
    const runtime = await this.library.runtimeStatus();
    if (!runtime) return null;
    const cloudSummary = parseRsrsCloudStatus(runtime.payload);
    const installState = this.currentInstallState();
    const version = await readRsrsVersion(executable, 4_000).catch(() => null);
    this.noteVersion(version);
    const failed = installState.status === "failed";
    const blocked = installBlocked(installState, RSRS_CLI_VERSION);
    return {
      ...base,
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
    };
  }

  private noteVersion(version: string | null) {
    const tooOld = version !== null && !rsrsVersionMeetsMinimum(version);
    this.upgradeRequired = tooOld
      ? { installed: version, minimum: RSRS_MIN_CLI_VERSION }
      : null;
  }

  userLibraryStatus() {
    return this.userLibrary.status().catch(() => NO_USER_LIBRARY);
  }

  // A partitioned recall (personal assistants) never reads the user's own
  // store; it has no partitions and would leak across them.
  async referenceRecall(input: {
    query: string;
    limit: number;
    timeoutMs: number;
  }) {
    if (!this.userLibraryEnabled()) return [];
    return this.userLibrary
      .recall(input)
      .catch((error: unknown): MemoryRecallItem[] => {
        logDaemonDiagnostic("info", "memory.userLibraryRecallFailed", {
          error: errorMessage(error),
        });
        return [];
      });
  }

  async referenceShow(id: string, timeoutMs: number) {
    if (!this.userLibraryEnabled()) return null;
    return this.userLibrary.show(id, timeoutMs).catch(() => null);
  }

  // The user's own rsrs setup can write an rsrs block into this agent's
  // global instructions; that block drives the `rsrs` command against the
  // user's own store, not the one Cocurdex keeps.
  async hostNote(agentType: string) {
    if (!(await this.library.available().catch(() => false))) return null;
    const injected = await this.library
      .injectedAgents()
      .catch((): string[] => []);
    return injected.includes(agentType) ? HOST_RSRS_NOTE : null;
  }
}
