import path from "node:path";
import type { RuntimeProviderConfig } from "@cocurdex/agent-core";
import { errorKindForLog } from "@cocurdex/shared";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Api, Model, Models } from "@earendil-works/pi-ai";
import { CodemodeSandbox } from "@earendil-works/pi-codemode";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import {
  createRegistry,
  type Extension,
  Harness,
  type Registry,
  type Report,
} from "@earendil-works/pi-durable";
import { createCodemodeExtension } from "@earendil-works/pi-durable/codemode";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { createToolSearchExtension } from "@earendil-works/pi-durable/tool-search";
import { createCodingTools } from "@earendil-works/pi-durable/tools";
import { logAdapterDiagnostic } from "../diagnostics";
import {
  createPiModelRuntime,
  resolvePiRuntimeModel,
} from "../pi-sdk/pi-model-runtime";
import { getPiAgentDir } from "../pi-sdk/pi-paths";
import { DurableAgentTools } from "./durable-agent-tools";
import {
  ChatExtension,
  createAssistantExtension,
  RunPolicy,
} from "./durable-extensions";
import { DurableMcpServers } from "./durable-mcp";
import { WorkspaceResourceCache } from "./durable-resources";
import { SearchTools } from "./durable-search-tools";

export const DURABLE_DATABASE_FILENAME = "pi-durable.sqlite";

function modelKey(provider: string, modelId: string) {
  return `${provider}\u0000${modelId}`;
}

/**
 * The extensions a durable conversation runs with, by session kind. Their names are stored with
 * each conversation, so they stay stable across releases.
 */
export interface DurableExtensions {
  assistant: Extension[];
  chat: Extension[];
}

/**
 * One durable Harness per user data directory, shared by every assistant and chat session. Its
 * conversations, runs, and tool calls live in `pi-durable.sqlite`, owned by the daemon process;
 * a run the daemon was stopped in resumes when the daemon opens it again.
 */
export class DurableHost {
  readonly agentDir: string;
  readonly agentTools = new DurableAgentTools();
  readonly resources: WorkspaceResourceCache;
  readonly mcp: DurableMcpServers;
  private readonly registry: Registry = createRegistry();
  private readonly resolvedModels = new Map<string, Model<Api>>();
  private runtime: ModelRuntime | null = null;
  private harnessPromise: Promise<Harness> | null = null;
  readonly extensions: DurableExtensions;

  constructor(private readonly userDataPath: string | undefined) {
    this.agentDir = getPiAgentDir(userDataPath);
    this.resources = new WorkspaceResourceCache(this.agentDir);
    this.mcp = new DurableMcpServers(this.agentDir, (extension) =>
      this.registry.install(extension),
    );
    const coding = createCodingTools();
    const codemode = createCodemodeExtension({
      sandbox: new CodemodeSandbox(),
    });
    const toolSearch = createToolSearchExtension();
    const assistant = createAssistantExtension(this.resources);
    for (const extension of [
      coding,
      SearchTools,
      codemode,
      toolSearch,
      RunPolicy,
      assistant,
      ChatExtension,
      this.agentTools.extension(),
    ]) {
      this.registry.install(extension);
    }
    this.extensions = {
      assistant: [
        coding,
        SearchTools,
        codemode,
        toolSearch,
        assistant,
        RunPolicy,
      ],
      chat: [ChatExtension],
    };
  }

  /** The agent tools extension as currently registered, after `refreshAgentTools()`. */
  agentToolsExtension() {
    return this.registry.snapshot().extension(this.agentTools.extension().name);
  }

  refreshAgentTools() {
    this.registry.install(this.agentTools.extension());
    return this.agentToolsExtension();
  }

  extensionByName(name: string) {
    return this.registry.snapshot().extension(name);
  }

  harness() {
    this.harnessPromise ??= this.open();
    return this.harnessPromise;
  }

  /**
   * Resolves the model a provider config names, with the user's edits and key, and makes it the
   * one generation gets for that provider and model ID.
   */
  async prepareModel(config: RuntimeProviderConfig) {
    const runtime = await this.modelRuntime([config.providerId]);
    const model = await resolvePiRuntimeModel(runtime, config);
    if (!model) {
      throw new Error(`Pi does not support provider api: ${config.api}`);
    }
    this.resolvedModels.set(modelKey(model.provider, model.id), model);
    return { provider: model.provider, modelId: model.id };
  }

  async close() {
    const opening = this.harnessPromise;
    this.harnessPromise = null;
    await this.mcp.close();
    if (!opening) return;
    const harness = await opening.catch(() => null);
    await harness?.close(BACKGROUND_CONTEXT);
  }

  private async modelRuntime(providers: readonly string[]) {
    this.runtime ??= await createPiModelRuntime(this.userDataPath, {
      refresh: "cache",
      providers,
    });
    return this.runtime;
  }

  private models(): Models {
    const runtime = this.runtime;
    if (!runtime) {
      throw new Error("Pi models are not loaded yet");
    }
    const resolved = this.resolvedModels;
    return new Proxy(runtime, {
      get(target, property, receiver) {
        if (property === "getModel") {
          return (provider: string, modelId: string) =>
            resolved.get(modelKey(provider, modelId)) ??
            target.getModel(provider, modelId);
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as Models;
  }

  private async open() {
    process.env.PI_CODING_AGENT_DIR = this.agentDir;
    await this.modelRuntime([]);
    const databasePath = this.userDataPath
      ? path.join(this.userDataPath, DURABLE_DATABASE_FILENAME)
      : ":memory:";
    const storage = await openNodeSqliteStorage(databasePath);
    const harness = await Harness.open(
      storage,
      {
        models: () => this.models(),
        registry: this.registry,
        settings: { afterFailedRun: "keep" },
        env: ({ cwd }) => (cwd ? new NodeExecutionEnv({ cwd }) : undefined),
        onReport: (report: Report) => {
          logAdapterDiagnostic("info", "pi-durable: report", {
            kind: report.kind,
            errorKind: errorKindForLog(report.error),
            message:
              report.error instanceof Error
                ? report.error.message
                : String(report.error),
          });
        },
      },
      BACKGROUND_CONTEXT,
    );
    logAdapterDiagnostic("info", "pi-durable: harness opened", {
      persistent: Boolean(this.userDataPath),
    });
    return harness;
  }
}

const hosts = new Map<string, DurableHost>();

export function getDurableHost(userDataPath: string | undefined) {
  const key = userDataPath ?? "";
  let host = hosts.get(key);
  if (!host) {
    host = new DurableHost(userDataPath);
    hosts.set(key, host);
  }
  return host;
}

export async function closeDurableHosts() {
  const all = [...hosts.values()];
  hosts.clear();
  await Promise.allSettled(all.map((host) => host.close()));
}
