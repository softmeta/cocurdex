import os from "node:os";
import { generatePiMemoryDigest } from "@cocurdex/agent-adapters";
import {
  type AgentRuntimeProviderConfig,
  buildMemoryRecallQuery,
  type CocurdexDaemonEvent,
  DEFAULT_MEMORY_SETTINGS,
  gateMemorySettings,
  isChatSession,
  isMissingMemoryIdentity,
  isUserLibraryMemoryId,
  MEMORY_DISABLED_MESSAGE,
  MEMORY_MISSING_EXECUTABLE_MESSAGE,
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
  type MemoryProviderId,
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
  type MessageRecord,
  memoryPartitionProject,
  normalizeMemorySettings,
  ReasonError,
  redactMemorySecrets,
  rsrsLibcFor,
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
import { AiMemoryExternal } from "./external/ai-memory-external";
import { aiMemoryDataDir } from "./external/ai-memory-library";
import {
  idleRsrsStatusFields,
  NO_USER_LIBRARY,
  RsrsExternal,
} from "./external/rsrs-external";
import type { ExternalMemory } from "./external/types";
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
  type MemoryCaptureMap,
  readMemoryCaptures,
  readMemoryInstallState,
  readMemorySettings,
  writeMemoryCapture,
  writeMemorySettings,
} from "./settings";

const USER_LIBRARY_READ_ONLY =
  "Entries from the user's own rsrs store are read-only in Cocurdex.";
/** The whole pre-turn recall, bodies included, so memory never holds up a turn for long. */
const TURN_RECALL_BUDGET_MS = 3_000;
const SESSION_DIGEST_TIMEOUT_MS = 60_000;
const SYNC_DELAY_MS = 5_000;
const SYNC_POLL_MS = 10 * 60_000;
const PROVIDER_NAMES: Record<MemoryProviderId, string> = {
  rsrs: "rsrs",
  "ai-memory": "ai-memory",
};

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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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

function clampRecallLimit(limit: number | undefined) {
  return Math.min(20, Math.max(1, Math.floor(limit ?? 8)));
}

export class MemoryService {
  private settings: MemorySettings | null = null;
  private initialization: Promise<void> | null = null;
  private policyCache: string | null = null;
  private startupPromise: Promise<void> | null = null;
  private readonly lifetime = new AbortController();
  private lastRecall: MemoryRecallStatus | null = null;
  private readonly externals = new Map<MemoryProviderId, ExternalMemory>();
  private builtinProvider: BuiltinMemoryProvider | null = null;
  private sync: Promise<MemoryLibrarySyncSummary> | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private syncPoll: NodeJS.Timeout | null = null;
  private syncedRevisions: {
    provider: MemoryProviderId;
    local: string;
    remote: string | null;
  } | null = null;
  private readonly lastSyncAt = new Map<MemoryProviderId, string>();
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
  }

  private get builtin() {
    this.builtinProvider ??= new BuiltinMemoryProvider({
      ...this.options.state.memoryStore,
      device: this.device,
      now: () => this.now(),
    });
    return this.builtinProvider;
  }

  // Memories live in the daemon's own store; the external library the user
  // chooses is kept in step with it and widens recall.
  private get provider(): MemoryProvider {
    return this.options.provider ?? this.builtin;
  }

  private homeDir() {
    return this.options.homeDir ?? os.homedir();
  }

  private externalFor(id: MemoryProviderId): ExternalMemory {
    const existing = this.externals.get(id);
    if (existing) return existing;
    const created = id === "rsrs" ? this.createRsrs() : this.createAiMemory();
    this.externals.set(id, created);
    return created;
  }

  private createRsrs() {
    return new RsrsExternal({
      userDataPath: this.options.userDataPath,
      state: this.options.state,
      settings: () => this.currentSettings(),
      platform: this.platform,
      homeDir: () => this.homeDir(),
      defaultUserDataPath: () =>
        this.options.defaultUserDataPath ?? getDefaultUserDataPath(),
      rsrsDataDir: this.options.rsrsDataDir,
      startRuntime: this.options.startRuntime,
      installRetryDelaysMs: this.options.installRetryDelaysMs,
      lifetime: this.lifetime.signal,
      now: () => this.now(),
      changed: () => this.broadcast(),
    });
  }

  private createAiMemory() {
    return new AiMemoryExternal({
      settings: () => this.currentSettings(),
      dataDir: () =>
        aiMemoryDataDir({
          platform: this.platform.os,
          env: process.env,
          homeDir: this.homeDir(),
        }),
      userDataPath: this.options.userDataPath,
      platform: this.platform,
      env: process.env,
      device: this.device,
      startRuntime: this.options.startRuntime,
      now: () => this.now(),
      changed: () => this.broadcast(),
    });
  }

  private get rsrs() {
    return this.externalFor("rsrs") as RsrsExternal;
  }

  /** The library chosen to keep in step with the store, if any. */
  private externalOf(settings: MemorySettings) {
    if (this.options.provider || !settings.enabled || !settings.provider) {
      return null;
    }
    return this.externalFor(settings.provider);
  }

  private get external() {
    return this.externalOf(this.currentSettings());
  }

  private get usesRsrs() {
    return this.external?.id === "rsrs";
  }

  private async ensureInitialized() {
    if (!this.initialization) {
      this.initialization = (async () => {
        try {
          // Settings written before rsrs became optional carry no choice for
          // it; an install that already ran on rsrs keeps it on.
          const installState = await readMemoryInstallState(this.options.state);
          this.settings = await readMemorySettings(
            this.options.state,
            installState.status === "ready",
          );
        } catch (error) {
          logDaemonDiagnostic("warn", "memory.initializeFailed", {
            error: errorMessage(error),
          });
          this.settings = null;
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
    const previous = this.currentSettings();
    this.settings = await writeMemorySettings(
      this.options.state,
      gateMemorySettings(normalizeMemorySettings(input), this.platform),
    );
    const next = this.currentSettings();
    for (const external of this.externals.values()) {
      external.settingsChanged(previous, next);
    }
    this.broadcast();
    const before = this.externalOf(previous);
    const after = this.externalOf(next);
    const rsrsMoved =
      after?.id === "rsrs" &&
      previous.providers.rsrs.cliPath !== next.providers.rsrs.cliPath;
    if (before !== after) {
      this.stopSync();
      if (before) void before.stop();
    }
    if (after && (before !== after || rsrsMoved)) {
      this.syncedRevisions = null;
      void this.startExternal(after, "chosen");
    }
    return next;
  }

  async initializeOnStartup() {
    this.startupPromise ??= (async () => {
      await this.ensureInitialized();
      const external = this.external;
      if (external) await this.startExternal(external, "startup");
    })();
    return this.startupPromise;
  }

  // Runs in the background so choosing a library answers at once.
  private async startExternal(
    external: ExternalMemory,
    reason: "startup" | "chosen",
  ) {
    try {
      await external.start(reason);
      if (this.external === external) this.startSync();
    } catch (error) {
      logDaemonDiagnostic("info", "memory.prepareFailed", {
        provider: external.id,
        error: errorMessage(error),
      });
    }
  }

  private changed() {
    this.broadcast();
    this.scheduleSync();
  }

  private broadcast() {
    this.options.broadcast({ type: "data.changed", areas: ["memory"] });
  }

  async getStatus(refresh = false): Promise<MemoryStatus> {
    await this.ensureInitialized();
    const settings = this.currentSettings();
    const external = this.external;
    const supported = this.rsrs.supported;
    const checkedAt = this.now().toISOString();
    const [rsrsFields, userLibrary, provider] = await Promise.all([
      external?.id === "rsrs"
        ? this.rsrs.statusFields(refresh)
        : idleRsrsStatusFields(settings, supported, checkedAt),
      external?.id === "rsrs" ? this.rsrs.userLibraryStatus() : NO_USER_LIBRARY,
      external
        ? external.status(refresh).then((status) => ({
            ...status,
            lastSyncAt: this.lastSyncAt.get(external.id) ?? null,
          }))
        : null,
    ]);
    return {
      ...rsrsFields,
      settings,
      provider,
      available: true,
      rsrsAvailable: external?.id === "rsrs" && rsrsFields.available,
      userLibrary,
      lastRecall: this.lastRecall,
    };
  }

  private assertUsesRsrs() {
    if (this.usesRsrs) return;
    throw new ReasonError(
      "memory.rsrsOff",
      "Memory works without rsrs. Installation, health checks, and accounts belong to rsrs: choose it in Settings > Memory, or run: cocurdex memory provider use rsrs.",
    );
  }

  async install(force = false): Promise<MemoryInstallResult> {
    await this.ensureInitialized();
    if (!this.rsrs.supported) {
      return {
        status: await this.getStatus(),
        installed: false,
        message: this.rsrs.unsupportedMessage(),
      };
    }
    this.assertUsesRsrs();
    const result = await this.rsrs.install(force);
    return { ...result, status: await this.getStatus(true) };
  }

  // Stops background sync and the libraries Cocurdex runs, so no process
  // outlives the daemon.
  async shutdown() {
    this.lifetime.abort(new Error("The daemon is shutting down"));
    this.stopSync();
    await Promise.all(
      [...this.externals.values()].map((external) => external.shutdown()),
    );
  }

  async doctor(options: { remote?: boolean; checkUpdate?: boolean } = {}) {
    await this.ensureInitialized();
    this.assertUsesRsrs();
    return this.rsrs.doctor(options);
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
      this.recallExternal({
        query,
        limit,
        project,
        timeoutMs: input.timeoutMs,
      }),
      project ? [] : this.recallReference(query, limit, input.timeoutMs),
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

  // The external library may rank by meaning where the built-in store
  // matches words. Its hits are reported under the store's own ids; one the
  // store lacks is still readable through the library until the next sync
  // brings it in.
  private async recallExternal(input: {
    query: string;
    limit: number;
    project: string | null;
    timeoutMs?: number;
  }): Promise<MemoryRecallItem[]> {
    const external = this.external;
    if (!external) return [];
    try {
      if (!(await external.usable())) return [];
      const result = await external.library.recall(input);
      if (result.error) throw new Error(result.error);
      const entries = this.options.state.memoryStore.entries;
      let unknown = false;
      const items = result.items.flatMap((item) => {
        const local = entries.findByRemoteId(external.id, item.id);
        if (local?.deletedAt) return [];
        if (!local) unknown = true;
        return [{ ...item, id: local?.id ?? item.id }];
      });
      if (unknown) this.scheduleSync();
      return items;
    } catch (error) {
      logDaemonDiagnostic("info", "memory.externalRecallFailed", {
        provider: external.id,
        error: errorMessage(error),
      });
      return [];
    }
  }

  // A partitioned recall (personal assistants) never reads a store the user
  // keeps outside Cocurdex; it has no partitions and would leak across them.
  private async recallReference(
    query: string,
    limit: number,
    timeoutMs = TURN_RECALL_BUDGET_MS,
  ) {
    const reference = this.external?.referenceRecall;
    if (!reference) return [];
    return reference.call(this.external, { query, limit, timeoutMs });
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
      const external = this.external;
      if (!external?.referenceShow) return null;
      return external.referenceShow(id, timeoutMs ?? 25_000);
    }
    const result = await this.provider.show(id, timeoutMs);
    if (result.error) {
      logDaemonDiagnostic("info", "memory.showReportedError", {
        error: result.error,
      });
    }
    return result.entry ?? this.showFromExternal(id, timeoutMs);
  }

  private async showFromExternal(id: string, timeoutMs?: number) {
    const external = this.external;
    if (!external) return null;
    if (this.options.state.memoryStore.entries.find(id)) return null;
    try {
      if (!(await external.usable())) return null;
      return (await external.library.show(id, timeoutMs)).entry;
    } catch (error) {
      logDaemonDiagnostic("info", "memory.externalShowFailed", {
        provider: external.id,
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

  async history(
    input: { id?: string | null; limit?: number; deleted?: boolean } = {},
  ) {
    const provider = await this.requireProvider();
    const limit = Math.min(500, Math.max(1, Math.floor(input.limit ?? 50)));
    return provider.history({
      id: input.id ?? null,
      limit,
      deleted: input.deleted === true,
    });
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

  private chosenExternal(only?: MemoryProviderId) {
    const external = this.external;
    if (only && external?.id !== only) {
      throw new ReasonError(
        "memory.rsrsOff",
        "rsrs is not the chosen memory library, so there is nothing to sync with. Choose it in Settings > Memory, or run: cocurdex memory provider use rsrs.",
      );
    }
    if (!external) {
      throw new ReasonError(
        "memory.providerOff",
        "Memory keeps to its built-in store, so there is nothing to sync with. Choose a library in Settings > Memory, or run: cocurdex memory provider use <rsrs|ai-memory>.",
      );
    }
    return external;
  }

  private async runSync(apply: boolean, only?: MemoryProviderId) {
    await this.ensureInitialized();
    const external = this.chosenExternal(only);
    const name = PROVIDER_NAMES[external.id];
    if (!(await external.usable())) {
      throw new ReasonError(
        "memory.providerUnavailable",
        external.id === "rsrs"
          ? MEMORY_MISSING_EXECUTABLE_MESSAGE
          : ((await external.status(true)).error ??
              `${name} is not available.`),
      );
    }
    const store = this.options.state.memoryStore;
    const revisions = async () => ({
      provider: external.id,
      local: String(store.entries.revision()),
      remote: await external.library.revision().catch(() => null),
    });
    const before = await revisions();
    const settled =
      before.remote !== null &&
      before.provider === this.syncedRevisions?.provider &&
      before.local === this.syncedRevisions.local &&
      before.remote === this.syncedRevisions.remote;
    if (settled) return summarizeMemorySync(planMemorySync([], [], new Map()));
    let library: MemoryTransferEntry[];
    try {
      library = await external.library.snapshot();
    } catch (error) {
      throw new ReasonError(
        "memory.providerUnavailable",
        `${name} could not list its memories: ${errorMessage(error)}`,
        { cause: error },
      );
    }
    const plan = planMemorySync(
      store.entries.all(),
      library,
      store.entries.remoteIds(external.id),
    );
    if (!apply) return summarizeMemorySync(plan);
    const failed = await applyMemorySync(plan, {
      builtin: this.builtin,
      entries: store.entries,
      transaction: store.transaction,
      external: external.library,
      now: () => this.now(),
    });
    this.syncedRevisions = failed === 0 ? await revisions() : null;
    this.lastSyncAt.set(external.id, this.now().toISOString());
    this.broadcast();
    if (!isEmptyMemorySync(plan)) this.policyCache = null;
    return summarizeMemorySync(plan, failed);
  }

  /** What a sync with the chosen library would change, without changing it. */
  previewSync(only?: MemoryProviderId): Promise<MemoryLibrarySyncSummary> {
    return this.runSync(false, only);
  }

  syncNow(only?: MemoryProviderId): Promise<MemoryLibrarySyncSummary> {
    if (only) this.chosenExternal(only);
    this.sync ??= this.runSync(true).finally(() => {
      this.sync = null;
    });
    return this.sync;
  }

  private backgroundSync() {
    if (this.lifetime.signal.aborted || !this.external) return;
    this.syncNow().catch((error: unknown) => {
      logDaemonDiagnostic("info", "memory.syncFailed", {
        error: errorMessage(error),
      });
    });
  }

  private scheduleSync() {
    if (!this.external || this.options.startRuntime === false) return;
    if (this.syncTimer || this.lifetime.signal.aborted) return;
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.backgroundSync();
    }, SYNC_DELAY_MS);
    this.syncTimer.unref?.();
  }

  // Memories other devices add reach this one through the library's own
  // sync, so it is read again from time to time, not only after a local write.
  private startSync() {
    if (!this.external || this.options.startRuntime === false) return;
    this.scheduleSync();
    if (this.syncPoll) return;
    this.syncPoll = setInterval(() => this.backgroundSync(), SYNC_POLL_MS);
    this.syncPoll.unref?.();
  }

  private stopSync() {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    if (this.syncPoll) clearInterval(this.syncPoll);
    this.syncTimer = null;
    this.syncPoll = null;
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
    trigger: "requested" | "ended" = "requested",
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
    if (trigger === "ended" && digest?.importance !== "important") {
      return { saved: false, memoryId: null, reason: "not-salient" };
    }
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

  agentInstructions(
    hasTools: boolean,
    personal = false,
    hostNote: string | null = null,
  ) {
    if (!hasTools || !this.isEnabledSync()) return "";
    if (personal) return personaMemoryPolicy();
    const policy = buildAgentMemoryPolicy(true);
    return hostNote ? `${policy}\n\n${hostNote}` : policy;
  }

  /** What the chosen library adds for an agent whose own setup drives it too. */
  async hostNote(agentType: string) {
    if (await this.readyProvider()) return null;
    const hostNote = this.external?.hostNote;
    if (!hostNote) return null;
    return hostNote.call(this.external, agentType).catch(() => null);
  }

  async getCaptures(): Promise<MemoryCaptureMap> {
    await this.ensureInitialized();
    return readMemoryCaptures(this.options.state);
  }

  async getTurnMessages(sessionId: string): Promise<MessageRecord[]> {
    return this.options.state.listMessagesBySessionId(sessionId);
  }
}
