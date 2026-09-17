import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CompatibleProviderModel } from "@cocurdex/shared";
import { isReasoningEffort } from "@cocurdex/shared";
import type { AcpConnection, AcpConnectionFactory } from "./acp-connection";
import {
  type AcpSessionModel,
  type AcpSessionModelState,
  readAcpSessionModelState,
} from "./acp-session-model";
import { createSdkAcpConnection } from "./sdk-acp-connection";

export interface AcpModelCatalogSpec {
  args: string[];
  command: string;
  initializeMeta?: Record<string, unknown>;
  providerId: string;
  providerName: string;
}

const ACP_MODEL_PROBE_TIMEOUT_MS = 20_000;

const catalogCache = new Map<string, CompatibleProviderModel[]>();
const inFlightProbes = new Map<
  string,
  Promise<CompatibleProviderModel[] | null>
>();

function toCompatibleModel(
  spec: AcpModelCatalogSpec,
  model: AcpSessionModel,
  defaultModelId: string | null,
  now: string,
): CompatibleProviderModel {
  const supportedReasoningEfforts = model.reasoningEfforts.flatMap((effort) =>
    isReasoningEffort(effort.value)
      ? [
          {
            reasoningEffort: effort.value,
            description: effort.description ?? effort.label ?? effort.value,
            label: effort.label,
          },
        ]
      : [],
  );

  return {
    provider: {
      id: spec.providerId,
      name: spec.providerName,
      baseUrl: "",
      enabled: true,
      apiKeySecretId: null,
      headersJson: null,
      createdAt: now,
      updatedAt: now,
    },
    model: {
      providerId: spec.providerId,
      modelId: model.modelId,
      name: model.name ?? model.modelId,
      api: "openai-responses",
      enabled: true,
      source: "api",
      contextLimit: model.contextWindow,
      outputLimit: null,
      capabilities: ["agent", "chat"],
      reasoning: model.reasoningEfforts.length > 0,
      defaultReasoningEffort:
        model.defaultReasoningEffort &&
        isReasoningEffort(model.defaultReasoningEffort)
          ? model.defaultReasoningEffort
          : null,
      supportedReasoningEfforts,
      isDefault: model.modelId === defaultModelId,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function mapCatalog(
  spec: AcpModelCatalogSpec,
  state: AcpSessionModelState | null,
): CompatibleProviderModel[] | null {
  if (!state || state.models.length === 0) {
    return null;
  }
  const now = new Date().toISOString();
  const defaultModelId =
    state.currentModelId ?? state.models[0]?.modelId ?? null;
  return state.models.map((model) =>
    toCompatibleModel(spec, model, defaultModelId, now),
  );
}

async function withProbeCwd<T>(run: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = await mkdtemp(path.join(tmpdir(), "cocurdex-acp-probe-"));
  try {
    return await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function withProbeTimeout<T>(
  run: () => Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  let timedOut = false;
  const work = run().then(
    (value) => (timedOut ? null : value),
    (error: unknown) => {
      if (timedOut) {
        return null;
      }
      throw error;
    },
  );
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function probeCatalog(
  spec: AcpModelCatalogSpec,
  connectionFactory: AcpConnectionFactory,
  cwd: string,
  timeoutMs: number,
): Promise<CompatibleProviderModel[] | null> {
  const connection = await connectionFactory({
    args: spec.args,
    command: spec.command,
    cwd,
    handlers: {
      onSessionUpdate() {},
      requestPermission() {
        return Promise.resolve({ outcome: { outcome: "cancelled" as const } });
      },
    },
  });

  try {
    return await withProbeTimeout(async () => {
      const response = await connection.initialize({
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
        clientInfo: { name: "Cocurdex", title: "Cocurdex", version: "0.0.0" },
        _meta: spec.initializeMeta,
      });
      const initializeCatalog = mapCatalog(
        spec,
        readAcpSessionModelState(response),
      );
      if (initializeCatalog) {
        return initializeCatalog;
      }
      const session = await connection.newSession({
        cwd,
        mcpServers: [],
      });
      return mapCatalog(spec, readAcpSessionModelState(session));
    }, timeoutMs);
  } finally {
    await connection.close();
  }
}

export async function listAcpProviderModels(
  spec: AcpModelCatalogSpec,
  connectionFactory: AcpConnectionFactory = createSdkAcpConnection,
  options: { forceRefresh?: boolean; timeoutMs?: number } = {},
): Promise<CompatibleProviderModel[]> {
  const cached = catalogCache.get(spec.providerId);
  if (cached && !options.forceRefresh) {
    return cached;
  }

  const timeoutMs = options.timeoutMs ?? ACP_MODEL_PROBE_TIMEOUT_MS;
  let probe = inFlightProbes.get(spec.providerId);
  if (!probe) {
    probe = (async () => {
      try {
        return await withProbeCwd((cwd) =>
          probeCatalog(spec, connectionFactory, cwd, timeoutMs),
        );
      } catch {
        return null;
      }
    })();
    inFlightProbes.set(spec.providerId, probe);
  }

  const probed = await probe;
  inFlightProbes.delete(spec.providerId);
  if (probed && probed.length > 0) {
    catalogCache.set(spec.providerId, probed);
    return probed;
  }
  if (options.forceRefresh && cached) {
    throw new Error(
      `${spec.providerName} model catalog refresh returned no models`,
    );
  }
  return cached ?? [];
}

export function resetAcpProviderModelsCache(providerId?: string) {
  if (providerId) {
    catalogCache.delete(providerId);
    inFlightProbes.delete(providerId);
    return;
  }
  catalogCache.clear();
  inFlightProbes.clear();
}
