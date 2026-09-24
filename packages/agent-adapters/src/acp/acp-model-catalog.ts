import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  AgentProviderModelAxes,
  CodexServiceTierOption,
  CompatibleProviderModel,
  ReasoningEffortOption,
} from "@cocurdex/shared";
import { isReasoningEffort } from "@cocurdex/shared";
import type { AcpConnection, AcpConnectionFactory } from "./acp-connection";
import {
  type AcpSessionModel,
  type AcpSessionModelState,
  isBaselineAcpSpeedValue,
  readAcpModelConfigOptionId,
  readAcpSessionEffortConfig,
  readAcpSessionModelState,
  readAcpSessionSpeedConfig,
} from "./acp-session-model";
import { createSdkAcpConnection } from "./sdk-acp-connection";

export interface AcpModelCatalogSpec {
  args: string[];
  command: string;
  initializeMeta?: Record<string, unknown>;
  providerId: string;
  providerName: string;
}

export interface AcpProviderLoginSpec extends AcpModelCatalogSpec {
  authMethodPriority: string[];
}

const ACP_MODEL_PROBE_TIMEOUT_MS = 20_000;
const ACP_PROVIDER_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

const catalogCache = new Map<string, CompatibleProviderModel[]>();
const inFlightProbes = new Map<
  string,
  Promise<CompatibleProviderModel[] | null>
>();
// Keyed `providerId::modelId`; one axes probe session per model per process —
// each probe costs a real (empty) agent session, so resolved results stick.
const modelAxesProbes = new Map<
  string,
  Promise<AgentProviderModelAxes | null>
>();
const inFlightLogins = new Map<string, Promise<void>>();

// ACP agents spell "no thinking" as `none`; the picker's vocabulary calls it
// `off` (and the adapter maps it back on the way out).
function toThinkingLevel(
  value: string,
): ReasoningEffortOption["reasoningEffort"] | null {
  if (value === "none") {
    return "off";
  }
  return isReasoningEffort(value) ? value : null;
}

function toSupportedReasoningEfforts(
  model: AcpSessionModel,
): ReasoningEffortOption[] {
  return model.reasoningEfforts.flatMap((effort) => {
    const level = toThinkingLevel(effort.value);
    return level
      ? [
          {
            reasoningEffort: level,
            description: effort.description ?? effort.label ?? effort.value,
            label: effort.label,
          },
        ]
      : [];
  });
}

// The baseline rung (Devin's "standard") is the picker's built-in default
// row; only the named tiers become options.
function toServiceTiers(model: AcpSessionModel): CodexServiceTierOption[] {
  return model.speedOptions
    .filter((option) => !isBaselineAcpSpeedValue(option.value))
    .map((option) => ({
      id: option.value,
      name: option.label ?? option.value,
      description: option.description ?? "",
    }));
}

function toModelAxes(model: AcpSessionModel): AgentProviderModelAxes {
  return {
    defaultReasoningEffort: model.defaultReasoningEffort
      ? toThinkingLevel(model.defaultReasoningEffort)
      : null,
    supportedReasoningEfforts: toSupportedReasoningEfforts(model),
    serviceTiers: toServiceTiers(model),
  };
}

function toCompatibleModel(
  spec: AcpModelCatalogSpec,
  model: AcpSessionModel,
  defaultModelId: string | null,
  now: string,
): CompatibleProviderModel {
  const axes = toModelAxes(model);
  const serviceTiers = axes.serviceTiers;
  const supportedReasoningEfforts = axes.supportedReasoningEfforts;
  const defaultEffort = axes.defaultReasoningEffort;

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
      defaultReasoningEffort: defaultEffort,
      supportedReasoningEfforts,
      ...(serviceTiers.length > 0 ? { serviceTiers } : {}),
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

async function withLoginTimeout<T>(
  run: () => Promise<T>,
  timeoutMs: number,
  providerName: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${providerName} login timed out`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function buildProbeInitializeRequest(spec: AcpModelCatalogSpec) {
  return {
    protocolVersion: 1,
    clientCapabilities: {
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
    },
    clientInfo: { name: "Cocurdex", title: "Cocurdex", version: "0.0.0" },
    _meta: spec.initializeMeta,
  };
}

const silentProbeHandlers = {
  onSessionUpdate() {},
  requestPermission() {
    return Promise.resolve({ outcome: { outcome: "cancelled" as const } });
  },
};

// Devin attaches effort/speed to the session's *current* model: switching the
// probe session to a model reveals which config options that model supports.
// When the session already runs the requested model its new-session response
// carries the axes directly and no switch is needed.
async function readModelAxesFromSession(
  connection: AcpConnection,
  session: { sessionId?: string },
  state: AcpSessionModelState,
  modelId: string,
): Promise<AgentProviderModelAxes | null> {
  const model = state.models.find((item) => item.modelId === modelId);
  if (!model) {
    return null;
  }
  if (state.currentModelId !== modelId) {
    const configId = readAcpModelConfigOptionId(session);
    const sessionId = session.sessionId;
    if (!configId || typeof sessionId !== "string") {
      return null;
    }
    try {
      const response = await connection.setSessionConfigOption({
        sessionId,
        configId,
        value: modelId,
      });
      const effort = readAcpSessionEffortConfig(response);
      const speed = readAcpSessionSpeedConfig(response);
      model.reasoningEfforts = effort?.options ?? [];
      model.defaultReasoningEffort = effort?.currentValue ?? null;
      model.speedOptions = speed?.options ?? [];
      model.defaultSpeed = speed?.currentValue ?? null;
    } catch {
      return null;
    }
  }
  return toModelAxes(model);
}

function mergeProbedModelAxes(
  providerId: string,
  modelId: string,
  axes: AgentProviderModelAxes,
) {
  const items = catalogCache.get(providerId);
  if (!items) {
    return;
  }
  catalogCache.set(
    providerId,
    items.map((item) =>
      item.model.modelId === modelId
        ? {
            ...item,
            model: {
              ...item.model,
              reasoning: axes.supportedReasoningEfforts.length > 0,
              defaultReasoningEffort: axes.defaultReasoningEffort,
              supportedReasoningEfforts: axes.supportedReasoningEfforts,
              serviceTiers:
                axes.serviceTiers.length > 0 ? axes.serviceTiers : undefined,
            },
          }
        : item,
    ),
  );
}

export async function probeAcpProviderModelAxes(
  spec: AcpModelCatalogSpec,
  modelId: string,
  connectionFactory: AcpConnectionFactory = createSdkAcpConnection,
  options: { timeoutMs?: number } = {},
): Promise<AgentProviderModelAxes | null> {
  const key = `${spec.providerId}::${modelId}`;
  let probe = modelAxesProbes.get(key);
  if (!probe) {
    probe = (async () => {
      try {
        return await withProbeCwd(async (cwd) => {
          const connection = await connectionFactory({
            args: spec.args,
            command: spec.command,
            cwd,
            handlers: silentProbeHandlers,
          });
          try {
            return await withProbeTimeout(async () => {
              await connection.initialize(buildProbeInitializeRequest(spec));
              const session = await connection.newSession({
                cwd,
                mcpServers: [],
              });
              const state = readAcpSessionModelState(session);
              return state
                ? readModelAxesFromSession(connection, session, state, modelId)
                : null;
            }, options.timeoutMs ?? ACP_MODEL_PROBE_TIMEOUT_MS);
          } finally {
            await connection.close();
          }
        });
      } catch {
        return null;
      }
    })();
    modelAxesProbes.set(key, probe);
  }
  const axes = await probe;
  if (!axes) {
    // Failed probes are retried on the next selection; a probe that resolves
    // to "no axes" (model legitimately has none) stays cached via the same
    // entry only when the agent answered — a null here means it did not.
    modelAxesProbes.delete(key);
    return null;
  }
  mergeProbedModelAxes(spec.providerId, modelId, axes);
  return axes;
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
    handlers: silentProbeHandlers,
  });

  try {
    return await withProbeTimeout(async () => {
      const response = await connection.initialize(
        buildProbeInitializeRequest(spec),
      );
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
      const state = readAcpSessionModelState(session);
      return mapCatalog(spec, state);
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
    for (const key of modelAxesProbes.keys()) {
      if (key.startsWith(`${providerId}::`)) {
        modelAxesProbes.delete(key);
      }
    }
    return;
  }
  catalogCache.clear();
  inFlightProbes.clear();
  modelAxesProbes.clear();
}

export function loginAcpProvider(
  spec: AcpProviderLoginSpec,
  connectionFactory: AcpConnectionFactory = createSdkAcpConnection,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  const pending = inFlightLogins.get(spec.providerId);
  if (pending) {
    return pending;
  }

  const timeoutMs = options.timeoutMs ?? ACP_PROVIDER_LOGIN_TIMEOUT_MS;
  const login = withProbeCwd(async (cwd) => {
    const connection = await connectionFactory({
      args: spec.args,
      command: spec.command,
      cwd,
      handlers: silentProbeHandlers,
    });
    try {
      await withLoginTimeout(
        async () => {
          const response = await connection.initialize(
            buildProbeInitializeRequest(spec),
          );
          const advertised = (response.authMethods ?? []).map(
            (method) => method.id,
          );
          const methodId =
            spec.authMethodPriority.find((id) => advertised.includes(id)) ??
            advertised[0];
          if (!methodId) {
            return;
          }
          await connection.authenticate({ methodId });
        },
        timeoutMs,
        spec.providerName,
      );
    } finally {
      await connection.close();
    }
  })
    .then(() => {
      resetAcpProviderModelsCache(spec.providerId);
    })
    .finally(() => {
      inFlightLogins.delete(spec.providerId);
    });

  inFlightLogins.set(spec.providerId, login);
  return login;
}
