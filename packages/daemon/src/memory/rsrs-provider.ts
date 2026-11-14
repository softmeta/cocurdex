import { stat } from "node:fs/promises";
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
  parseVersion,
  type RsrsExecutable,
  readInjectedHosts,
  readRsrsPolicy,
  readRsrsStatus,
  recallMemories,
  rememberMemory,
  runRsrs,
  showMemory,
  stopRsrsRuntime,
} from "./rsrs";
import { managedRsrsPath, type RsrsHome, rsrsHomeEnv } from "./rsrs-install";
import { cliInvoke, type RsrsInvoke } from "./rsrs-invoke";
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
  execRuntimeCli,
  findRuntime,
  type RuntimeEndpoint,
  RuntimeUnreachableError,
} from "./runtime";

const CACHE_MS = 30_000;
const RUNTIME_START_TIMEOUT_MS = 60_000;
const PARTITION_LIST_WINDOW = 500;

export interface RsrsMemoryProviderOptions {
  settings(): MemorySettings;
  home(): Promise<RsrsHome>;
  os: string;
  startRuntime?: boolean;
  now(): Date;
}

async function isFile(file: string) {
  return stat(file).then(
    (info) => info.isFile(),
    () => false,
  );
}

async function answersVersion(executable: RsrsExecutable) {
  try {
    const result = await runRsrs(executable, ["--version"], {
      timeoutMs: 5_000,
    });
    return result.code === 0 || parseVersion(result.stdout) !== null;
  } catch {
    return false;
  }
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
    this.resolved = await this.findExecutable();
    this.resolvedAt = this.nowMs();
    return this.resolved;
  }

  private async findExecutable(): Promise<RsrsExecutable | null> {
    const home = await this.options.home();
    const env = rsrsHomeEnv(home);
    const configured = this.options.settings().cliPath;
    if (configured) {
      const executable = { command: configured, env };
      return (await answersVersion(executable)) ? executable : null;
    }
    const command = managedRsrsPath(home.dataDir, this.options.os);
    return (await isFile(command)) ? { command, env } : null;
  }

  async stopRuntime(timeoutMs?: number) {
    const executable = await this.executable();
    this.warming = null;
    this.invalidateRuntime();
    if (!executable || !(await this.runtime(false))) return;
    await stopRsrsRuntime(executable, timeoutMs).catch((error: unknown) => {
      logDaemonDiagnostic("info", "memory.runtimeStopFailed", {
        error: errorMessage(error),
      });
    });
    this.invalidateRuntime();
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

  async runtime(start = true): Promise<RuntimeEndpoint | null> {
    if (this.endpoint && this.nowMs() - this.endpointCheckedAt < CACHE_MS) {
      return this.endpoint;
    }
    const executable = await this.executable();
    if (!executable) return null;
    const { dataDir } = await this.options.home();
    const endpoint = await findRuntime(dataDir);
    if (!endpoint && start && this.options.startRuntime !== false) {
      this.startRuntimeInBackground(executable);
    }
    return this.adoptEndpoint(endpoint);
  }

  private startRuntimeInBackground(executable: RsrsExecutable) {
    this.startingRuntime ??= readRsrsStatus(
      executable,
      RUNTIME_START_TIMEOUT_MS,
    )
      .then(() => this.options.home())
      .then((home) => findRuntime(home.dataDir))
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

  private adoptEndpoint(endpoint: RuntimeEndpoint | null) {
    this.endpoint = endpoint;
    this.endpointCheckedAt = this.nowMs();
    return endpoint;
  }

  invalidateRuntime() {
    this.endpoint = null;
    this.endpointCheckedAt = 0;
  }

  async runtimeStatus() {
    const endpoint = await this.runtime();
    if (!endpoint) return null;
    try {
      const { payload } = await execRuntimeCli(
        endpoint,
        ["status", "--json"],
        5_000,
      );
      if (payload.status === "fail") throw new Error("status failed");
      return { runtimeVersion: endpoint.runtimeVersion, payload };
    } catch (error) {
      logDaemonDiagnostic("info", "memory.runtimeStatusFailed", {
        error: errorMessage(error),
      });
      this.invalidateRuntime();
      return null;
    }
  }

  private invoker(
    executable: RsrsExecutable,
    kind: "read" | "write",
  ): RsrsInvoke {
    return async (args, timeoutMs) => {
      const startedAt = performance.now();
      const left = () =>
        Math.max(0, Math.floor(timeoutMs - (performance.now() - startedAt)));
      const endpoint = await this.runtime();
      if (endpoint) {
        try {
          return await execRuntimeCli(endpoint, args, left());
        } catch (error) {
          const unreached = error instanceof RuntimeUnreachableError;
          if (!unreached && (kind === "write" || isTimeoutError(error))) {
            throw error;
          }
          logDaemonDiagnostic("info", "memory.runtimeCallFailed", {
            error: errorMessage(error),
          });
          this.invalidateRuntime();
        }
      }
      const remaining = left();
      if (remaining === 0) {
        throw new Error(`rsrs ${args[0]} timed out after ${timeoutMs}ms`);
      }
      return cliInvoke(executable)(args, remaining);
    };
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
      const result = await recallMemories(this.invoker(executable, "read"), {
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
    return recallMemories(this.invoker(executable, "read"), {
      query: input.query,
      limit: input.limit,
      project: input.project,
      timeoutMs: input.timeoutMs,
    });
  }

  async show(id: string, timeoutMs?: number) {
    const executable = await this.requireExecutable();
    return showMemory(this.invoker(executable, "read"), id, timeoutMs);
  }

  async list(input: MemoryProviderListInput): Promise<MemoryEntry[]> {
    const executable = await this.requireExecutable();
    const window = input.project
      ? Math.max(input.limit, PARTITION_LIST_WINDOW)
      : input.limit;
    const entries = await this.reads.run(() =>
      listMemories(this.invoker(executable, "read"), {
        limit: window,
        since: input.since,
      }),
    );
    const matching = input.project
      ? entries.filter((entry) => entry.project === input.project)
      : entries;
    return matching.slice(0, input.limit);
  }

  async remember(input: MemoryRememberInput): Promise<MemoryRememberResult> {
    const executable = await this.requireExecutable();
    return this.writes.run(async () => {
      try {
        return await rememberMemory(this.invoker(executable, "write"), input);
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
    await this.writes.run(() =>
      updateMemory(this.invoker(executable, "write"), input),
    );
  }

  async forget(id: string) {
    const executable = await this.requireExecutable();
    await this.writes.run(() =>
      forgetMemory(this.invoker(executable, "write"), id),
    );
  }

  async restore(id: string) {
    const executable = await this.requireExecutable();
    await this.writes.run(() =>
      restoreMemory(this.invoker(executable, "write"), id),
    );
  }

  async history(input: { id: string | null; limit: number }) {
    const executable = await this.requireExecutable();
    return this.reads.run(() =>
      readMemoryHistory(this.invoker(executable, "read"), input),
    );
  }

  async revision() {
    const executable = await this.requireExecutable();
    return readMemoryRevision(this.invoker(executable, "read"));
  }

  async exportTo(file: string) {
    const executable = await this.requireExecutable();
    await this.reads.run(() =>
      exportMemories(this.invoker(executable, "read"), file),
    );
  }

  async importFrom(file: string): Promise<MemoryImportResult> {
    const executable = await this.requireExecutable();
    return this.writes.run(() =>
      importMemories(this.invoker(executable, "write"), file),
    );
  }
}
