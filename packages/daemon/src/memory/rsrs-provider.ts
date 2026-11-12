import type {
  MemoryEntry,
  MemoryImportResult,
  MemoryProviderCapabilities,
  MemoryRememberInput,
  MemoryRememberResult,
  MemorySettings,
  MemoryUpdateInput,
} from "@cocurdex/shared";
import { findBuiltInAgentByRsrsHost } from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../diagnostics";
import type {
  MemoryProvider,
  MemoryProviderListInput,
  MemoryProviderRecallInput,
} from "./provider";
import {
  materializeNativeBinary,
  type RsrsExecutable,
  readInjectedHosts,
  readRsrsPolicy,
  readRsrsStatus,
  recallMemories,
  recallMemoriesViaRuntime,
  rememberMemory,
  rememberMemoryViaRuntime,
  resolveRsrsExecutable,
  showMemory,
  showMemoryViaRuntime,
} from "./rsrs";
import {
  exportMemories,
  forgetMemory,
  importMemories,
  listMemories,
  readMemoryHistory,
  readMemoryRevision,
  readRsrsLibraryCapabilities,
  restoreMemory,
  updateMemory,
} from "./rsrs-library";
import {
  callRuntimeTool,
  findRuntime,
  listRuntimeTools,
  type RuntimeEndpoint,
} from "./runtime";

const CACHE_MS = 30_000;
const RUNTIME_START_TIMEOUT_MS = 60_000;
const PARTITION_LIST_WINDOW = 500;

export interface RsrsMemoryProviderOptions {
  settings(): MemorySettings;
  dataDir?: string;
  startRuntime?: boolean;
  now(): Date;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isTimeoutError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

export function startBudget(timeoutMs: number | undefined) {
  const startedAt = performance.now();
  const remaining = () =>
    timeoutMs === undefined
      ? undefined
      : Math.max(0, Math.floor(timeoutMs - (performance.now() - startedAt)));
  return {
    remaining,
    remainingOrThrow(operation: string) {
      const left = remaining();
      if (left === 0) {
        throw new Error(`${operation} timed out after ${timeoutMs}ms`);
      }
      return left;
    },
  };
}

class TaskQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(task, task);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

export class RsrsMemoryProvider implements MemoryProvider {
  readonly id = "rsrs";
  private resolved: RsrsExecutable | null = null;
  private resolvedAt = 0;
  private endpoint: RuntimeEndpoint | null = null;
  private endpointCheckedAt = 0;
  private tools: Map<string, Set<string>> | null = null;
  private policyText: string | null = null;
  private capabilitySet: MemoryProviderCapabilities | null = null;
  private injected: { agents: string[]; at: number } | null = null;
  private readonly reads = new TaskQueue();
  private readonly writes = new TaskQueue();
  private startingRuntime: Promise<void> | null = null;
  private warming: Promise<void> | null = null;

  constructor(private readonly options: RsrsMemoryProviderOptions) {}

  private nowMs() {
    return this.options.now().getTime();
  }

  async executable(force = false) {
    if (!force && this.resolved) return this.resolved;
    if (!force && this.nowMs() - this.resolvedAt < CACHE_MS) {
      return this.resolved;
    }
    const found = await resolveRsrsExecutable(this.options.settings());
    this.resolved =
      found?.source === "path"
        ? ((await materializeNativeBinary(found)) ?? found)
        : found;
    this.resolvedAt = this.nowMs();
    return this.resolved;
  }

  forgetExecutable() {
    this.warming = null;
    this.resolved = null;
    this.resolvedAt = 0;
    this.capabilitySet = null;
    this.policyText = null;
    this.injected = null;
    this.invalidateRuntime();
  }

  adoptExecutable(executable: RsrsExecutable) {
    this.warming = null;
    this.resolved = executable;
    this.resolvedAt = this.nowMs();
    this.capabilitySet = null;
    this.policyText = null;
  }

  private async requireExecutable() {
    const executable = await this.executable();
    if (!executable) throw new Error("rsrs is not installed");
    return executable;
  }

  async runtime(): Promise<RuntimeEndpoint | null> {
    if (this.endpoint && this.nowMs() - this.endpointCheckedAt < CACHE_MS) {
      return this.endpoint;
    }
    const executable = await this.executable();
    if (!executable) return null;
    const endpoint = await findRuntime(this.options.dataDir);
    if (!endpoint && this.options.startRuntime !== false) {
      this.startRuntimeInBackground(executable);
    }
    return this.adoptEndpoint(endpoint);
  }

  private startRuntimeInBackground(executable: RsrsExecutable) {
    this.startingRuntime ??= readRsrsStatus(
      executable,
      RUNTIME_START_TIMEOUT_MS,
    )
      .then(() => findRuntime(this.options.dataDir))
      .then(async (endpoint) => {
        if (endpoint) await this.adoptEndpoint(endpoint);
      })
      .catch((error: unknown) => {
        logDaemonDiagnostic("info", "memory.runtimeUnavailable", {
          error: errorMessage(error),
        });
      })
      .finally(() => {
        this.startingRuntime = null;
      });
  }

  private async adoptEndpoint(endpoint: RuntimeEndpoint | null) {
    this.endpoint = endpoint;
    this.endpointCheckedAt = this.nowMs();
    this.tools = endpoint
      ? await listRuntimeTools(endpoint).catch(() => null)
      : null;
    return endpoint;
  }

  invalidateRuntime() {
    this.endpoint = null;
    this.endpointCheckedAt = 0;
    this.tools = null;
  }

  async runtimeStatus() {
    const endpoint = await this.runtime();
    if (!endpoint) return null;
    try {
      const payload = await callRuntimeTool(
        endpoint,
        "memory_status",
        {},
        5_000,
      );
      return { bin: endpoint.bin ?? null, payload };
    } catch (error) {
      logDaemonDiagnostic("info", "memory.runtimeStatusFailed", {
        error: errorMessage(error),
      });
      this.invalidateRuntime();
      return null;
    }
  }

  private runtimeSupports(tool: string, argument: string) {
    return this.tools?.get(tool)?.has(argument) ?? false;
  }

  private async viaRuntime<T>(
    endpoint: RuntimeEndpoint | null,
    call: (endpoint: RuntimeEndpoint) => Promise<T>,
    fallback: () => Promise<T>,
  ): Promise<T> {
    if (!endpoint) return fallback();
    try {
      return await call(endpoint);
    } catch (error) {
      logDaemonDiagnostic("info", "memory.runtimeCallFailed", {
        error: errorMessage(error),
      });
      if (!isTimeoutError(error)) this.invalidateRuntime();
      return fallback();
    }
  }

  async available() {
    return (await this.executable()) !== null;
  }

  async warmup(reset = false) {
    if (this.options.startRuntime === false) return;
    if (reset) this.warming = null;
    this.warming ??= (async () => {
      const executable = await this.requireExecutable();
      const status = await readRsrsStatus(executable, RUNTIME_START_TIMEOUT_MS);
      if (!status.hasKeys || status.workspaceMode === "off") return;
      const result = await recallMemories(executable, {
        query: "Cocurdex memory readiness",
        project: "cocurdex/me",
        limit: 1,
        timeoutMs: RUNTIME_START_TIMEOUT_MS,
      });
      if (result.error) throw new Error(result.error);
    })().catch((error: unknown) => {
      logDaemonDiagnostic("info", "memory.warmupFailed", {
        error: errorMessage(error),
      });
    });
    return this.warming;
  }

  async capabilities(): Promise<MemoryProviderCapabilities> {
    if (this.capabilitySet) return this.capabilitySet;
    const executable = await this.requireExecutable();
    this.capabilitySet = await readRsrsLibraryCapabilities(executable);
    return this.capabilitySet;
  }

  async policy() {
    if (this.policyText) return this.policyText;
    const executable = await this.requireExecutable();
    this.policyText = await readRsrsPolicy(executable);
    return this.policyText;
  }

  async injectedAgents() {
    if (this.injected && this.nowMs() - this.injected.at < CACHE_MS) {
      return this.injected.agents;
    }
    const executable = await this.requireExecutable();
    const hosts = await readInjectedHosts(executable).catch((): string[] => []);
    const agents = hosts.flatMap((host) => {
      const agent = findBuiltInAgentByRsrsHost(host);
      return agent ? [agent] : [];
    });
    this.injected = { agents, at: this.nowMs() };
    return agents;
  }

  async recall(input: MemoryProviderRecallInput) {
    const executable = await this.requireExecutable();
    const budget = startBudget(input.timeoutMs);
    return this.reads.run(async () => {
      const endpoint = await this.runtime();
      const useRuntime =
        endpoint !== null &&
        (!input.project || this.runtimeSupports("memory_recall", "project"));
      return this.viaRuntime(
        useRuntime ? endpoint : null,
        (target) =>
          recallMemoriesViaRuntime(target, {
            query: input.query,
            limit: input.limit,
            project: input.project,
            timeoutMs: budget.remaining(),
          }),
        () =>
          recallMemories(executable, {
            query: input.query,
            limit: input.limit,
            project: input.project,
            timeoutMs: budget.remainingOrThrow("rsrs recall"),
          }),
      );
    });
  }

  async show(id: string, timeoutMs?: number) {
    const executable = await this.requireExecutable();
    return this.reads.run(async () =>
      this.viaRuntime(
        await this.runtime(),
        (target) => showMemoryViaRuntime(target, id, timeoutMs),
        () => showMemory(executable, id, timeoutMs),
      ),
    );
  }

  async list(input: MemoryProviderListInput): Promise<MemoryEntry[]> {
    const executable = await this.requireExecutable();
    const window = input.project
      ? Math.max(input.limit, PARTITION_LIST_WINDOW)
      : input.limit;
    const entries = await this.reads.run(() =>
      listMemories(executable, { limit: window, since: input.since }),
    );
    const matching = input.project
      ? entries.filter((entry) => entry.project === input.project)
      : entries;
    return matching.slice(0, input.limit);
  }

  async remember(input: MemoryRememberInput): Promise<MemoryRememberResult> {
    const executable = await this.requireExecutable();
    return this.writes.run(async () => {
      const endpoint = await this.runtime();
      const useRuntime =
        endpoint !== null &&
        (!input.project ||
          this.runtimeSupports("memory_remember", "project")) &&
        !input.tags?.length;
      if (!useRuntime || !endpoint) return rememberMemory(executable, input);
      try {
        return await rememberMemoryViaRuntime(endpoint, input);
      } catch (error) {
        throw new Error(
          `Memory write could not be confirmed; inspect the library before retrying. ${errorMessage(error)}`,
          { cause: error },
        );
      }
    });
  }

  async update(input: MemoryUpdateInput) {
    const executable = await this.requireExecutable();
    await this.writes.run(() => updateMemory(executable, input));
  }

  async forget(id: string) {
    const executable = await this.requireExecutable();
    await this.writes.run(() => forgetMemory(executable, id));
  }

  async restore(id: string) {
    const executable = await this.requireExecutable();
    await this.writes.run(() => restoreMemory(executable, id));
  }

  async history(input: { id: string | null; limit: number }) {
    const executable = await this.requireExecutable();
    return this.reads.run(() => readMemoryHistory(executable, input));
  }

  async revision() {
    const executable = await this.requireExecutable();
    return readMemoryRevision(executable);
  }

  async exportTo(file: string) {
    const executable = await this.requireExecutable();
    await this.reads.run(() => exportMemories(executable, file));
  }

  async importFrom(file: string): Promise<MemoryImportResult> {
    const executable = await this.requireExecutable();
    return this.writes.run(() => importMemories(executable, file));
  }
}
