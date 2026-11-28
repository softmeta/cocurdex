import { lookupExecutable } from "@cocurdex/agent-core";
import {
  AI_MEMORY_DEFAULT_SERVER_URL,
  aiMemoryAsset,
  type MemoryPlatform,
  type MemorySettings,
} from "@cocurdex/shared";
import { allocateLoopbackPort } from "../rsrs-install";
import {
  aiMemoryAnswers,
  type HostedAiMemory,
  hostAiMemory,
  initAiMemoryDataDir,
  installManagedAiMemory,
  managedAiMemoryDataDir,
} from "./ai-memory-host";
import { AiMemoryLibrary } from "./ai-memory-library";
import type { ExternalMemory } from "./types";

const PREPARE_RETRY_MS = 5 * 60_000;

export interface AiMemoryHostDeps {
  answers(url: string): Promise<boolean>;
  findExecutable(): Promise<string | null>;
  install(): Promise<string>;
  init(executable: string, dataDir: string): Promise<void>;
  allocatePort(): Promise<number>;
  host(input: {
    executable: string;
    dataDir: string;
    port: number;
    exited(code: number | null): void;
  }): Promise<HostedAiMemory>;
}

export interface AiMemoryExternalOptions {
  settings(): MemorySettings;
  /** The data folder of the user's own ai-memory install. */
  dataDir(): string;
  userDataPath: string;
  platform: MemoryPlatform;
  env: NodeJS.ProcessEnv;
  device: string;
  startRuntime?: boolean;
  now(): Date;
  changed(): void;
  host?: Partial<AiMemoryHostDeps>;
}

interface Endpoint {
  url: string;
  dataDir: string;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reuses the user's ai-memory (a server already answering, or an installed
 * binary and its data folder); otherwise installs the pinned release. Without
 * a running server Cocurdex hosts `ai-memory serve` on loopback while the
 * library is chosen.
 */
export class AiMemoryExternal implements ExternalMemory {
  readonly id = "ai-memory" as const;
  readonly library: AiMemoryLibrary;
  private readonly deps: AiMemoryHostDeps;
  private endpoint: Endpoint | null = null;
  private hosted: HostedAiMemory | null = null;
  private preparing: Promise<void> | null = null;
  private prepareError: string | null = null;
  private failedAt = 0;
  private wanted = false;

  constructor(private readonly options: AiMemoryExternalOptions) {
    const asset = aiMemoryAsset(options.platform);
    this.deps = {
      answers: (url) => aiMemoryAnswers(url),
      findExecutable: () => lookupExecutable("ai-memory", { env: options.env }),
      install: () => {
        if (!asset) {
          throw new Error(
            `ai-memory publishes no build for ${options.platform.os} ${options.platform.arch}; install it yourself and set its server address`,
          );
        }
        return installManagedAiMemory({
          userDataPath: options.userDataPath,
          asset,
          platform: options.platform.os as NodeJS.Platform,
        });
      },
      init: initAiMemoryDataDir,
      allocatePort: allocateLoopbackPort,
      host: hostAiMemory,
      ...options.host,
    };
    this.library = new AiMemoryLibrary({
      serverUrl: () => this.customUrl() ?? this.endpoint?.url ?? null,
      dataDir: () =>
        this.customUrl() ? options.dataDir() : this.activeDataDir(),
      env: options.env,
      device: options.device,
      now: options.now,
    });
  }

  private customUrl() {
    return this.options.settings().providers.aiMemory.serverUrl;
  }

  private activeDataDir() {
    return this.endpoint?.dataDir ?? this.options.dataDir();
  }

  private managesServer() {
    return (
      this.wanted && !this.customUrl() && this.options.startRuntime !== false
    );
  }

  async start() {
    this.wanted = true;
    if (!this.managesServer()) return;
    await this.prepare();
  }

  private prepare() {
    this.preparing ??= this.connect()
      .then(
        () => {
          this.prepareError = null;
        },
        (error: unknown) => {
          this.prepareError = errorMessage(error);
          this.failedAt = Date.now();
          throw error;
        },
      )
      .finally(() => {
        this.preparing = null;
        this.options.changed();
      });
    this.options.changed();
    return this.preparing;
  }

  private async connect() {
    if (await this.deps.answers(AI_MEMORY_DEFAULT_SERVER_URL)) {
      this.endpoint = {
        url: AI_MEMORY_DEFAULT_SERVER_URL,
        dataDir: this.options.dataDir(),
      };
      return;
    }
    const own = await this.deps.findExecutable();
    const executable = own ?? (await this.deps.install());
    const dataDir = own
      ? this.options.dataDir()
      : managedAiMemoryDataDir(this.options.userDataPath);
    await this.deps.init(executable, dataDir);
    const hosted = await this.deps.host({
      executable,
      dataDir,
      port: await this.deps.allocatePort(),
      exited: () => {
        if (this.hosted !== hosted) return;
        this.hosted = null;
        this.endpoint = null;
        this.options.changed();
      },
    });
    if (!this.managesServer()) {
      await hosted.stop();
      return;
    }
    await this.hosted?.stop();
    this.hosted = hosted;
    this.endpoint = { url: hosted.url, dataDir };
  }

  private async release() {
    const hosted = this.hosted;
    this.hosted = null;
    this.endpoint = null;
    await hosted?.stop();
  }

  async stop() {
    this.wanted = false;
    await this.release();
  }

  async shutdown() {
    await this.release();
  }

  async usable() {
    const available = await this.library.available();
    if (
      !available &&
      this.managesServer() &&
      !this.preparing &&
      Date.now() - this.failedAt >= PREPARE_RETRY_MS
    ) {
      this.endpoint = null;
      void this.prepare().catch(() => undefined);
    }
    return available;
  }

  async status() {
    const location = this.library.serverUrl();
    if (this.preparing) {
      return {
        id: this.id,
        available: false,
        preparing: true,
        version: null,
        location: this.customUrl() ?? null,
        error: null,
      };
    }
    try {
      const identity = await this.library.identity();
      return {
        id: this.id,
        available: true,
        preparing: false,
        version: identity?.version ?? null,
        location,
        error: null,
      };
    } catch (error) {
      const unreachable = this.managesServer() && !this.endpoint;
      return {
        id: this.id,
        available: false,
        preparing: false,
        version: null,
        location,
        error:
          unreachable && this.prepareError
            ? this.prepareError
            : errorMessage(error),
      };
    }
  }

  settingsChanged(previous: MemorySettings, next: MemorySettings) {
    const before = previous.providers.aiMemory.serverUrl;
    const after = next.providers.aiMemory.serverUrl;
    if (before === after || !this.wanted) return;
    if (this.options.startRuntime === false) return;
    if (after) {
      void this.release();
      return;
    }
    this.failedAt = 0;
    void this.prepare().catch(() => undefined);
  }
}
