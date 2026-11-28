import type { MemorySettings } from "@cocurdex/shared";
import { AiMemoryLibrary } from "./ai-memory-library";
import type { ExternalMemory } from "./types";

export interface AiMemoryExternalOptions {
  settings(): MemorySettings;
  dataDir(): string;
  env: NodeJS.ProcessEnv;
  device: string;
  now(): Date;
}

/** An ai-memory server the user runs; Cocurdex only talks to it. */
export class AiMemoryExternal implements ExternalMemory {
  readonly id = "ai-memory" as const;
  readonly library: AiMemoryLibrary;

  constructor(options: AiMemoryExternalOptions) {
    this.library = new AiMemoryLibrary({
      serverUrl: () => options.settings().providers.aiMemory.serverUrl,
      dataDir: options.dataDir,
      env: options.env,
      device: options.device,
      now: options.now,
    });
  }

  async start() {}

  async stop() {}

  async shutdown() {}

  usable() {
    return this.library.available();
  }

  async status() {
    const location = this.library.serverUrl();
    try {
      const identity = await this.library.identity();
      return {
        id: this.id,
        available: true,
        version: identity?.version ?? null,
        location,
        error: null,
      };
    } catch (error) {
      return {
        id: this.id,
        available: false,
        version: null,
        location,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  settingsChanged() {}
}
