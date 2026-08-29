import { homedir } from "node:os";
import type { CompatibleProviderModel } from "@cocurdex/shared";
import { isReasoningEffort } from "@cocurdex/shared";
import type {
  AcpConnection,
  AcpConnectionFactory,
} from "../acp/acp-connection";
import {
  type AcpSessionModel,
  type AcpSessionModelState,
  readAcpSessionModelState,
} from "../acp/acp-session-model";
import { createSdkAcpConnection } from "../acp/sdk-acp-connection";
import {
  GROK_BUILD_ARGS,
  GROK_BUILD_COMMAND,
  GROK_BUILD_INITIALIZE_META,
} from "./grok-build-process";

export const GROK_BUILD_PROVIDER_ID = "grok-build";
export const GROK_BUILD_DEFAULT_MODEL_ID = "grok-4.6";
export const GROK_BUILD_MODELS_LIST_METHOD = "x.ai/models/list";

// Grok Build owns its own model catalog. `initialize` only returns the bundled
// snapshot (historically a single model). The live remote catalog — currently
// grok-4.6 plus grok-4.5 — is served by `x.ai/models/list`, which waits for
// the first fetch. Official `grok models` does initialize + that extension
// (see xai-grok-shell cli_models.rs). We do the same on a short-lived ACP
// process and never call `session/new`, which would persist under
// ~/.grok/sessions.
const PROBE_TIMEOUT_MS = 20_000;

function toCompatibleModel(
  model: AcpSessionModel,
  defaultModelId: string | null,
  now: string,
): CompatibleProviderModel {
  // Grok owns this ladder: forward every level it advertises, with its own
  // description. `none` is Cocurdex's "off" and is handled by the thinking
  // level axis, so it is not a picker entry here.
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
      id: GROK_BUILD_PROVIDER_ID,
      name: "Grok Build",
      baseUrl: "",
      enabled: true,
      apiKeySecretId: null,
      headersJson: null,
      createdAt: now,
      updatedAt: now,
    },
    model: {
      providerId: GROK_BUILD_PROVIDER_ID,
      modelId: model.modelId,
      name: model.name ?? model.modelId,
      // Grok Build's default models speak the Responses API shape.
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

// Used when the probe fails (Grok missing, unauthenticated, or hanging) so the
// picker still has something selectable.
function fallbackModels(now: string): CompatibleProviderModel[] {
  return [
    toCompatibleModel(
      {
        modelId: GROK_BUILD_DEFAULT_MODEL_ID,
        name: "Grok 4.6",
        description: null,
        contextWindow: null,
        defaultReasoningEffort: "medium",
        reasoningEfforts: ["xhigh", "high", "medium", "low"].map((value) => ({
          value,
          label: null,
          description: null,
        })),
      },
      GROK_BUILD_DEFAULT_MODEL_ID,
      now,
    ),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// `x.ai/models/list` wraps SessionModelState in ExtMethodResult `{ result }`.
// The ACP SDK may also surface the state at the top level.
export function readGrokBuildListedModelState(
  value: unknown,
): AcpSessionModelState | null {
  if (!isRecord(value)) {
    return null;
  }
  const payload = isRecord(value.result) ? value.result : value;
  return readAcpSessionModelState({ models: payload });
}

export async function fetchGrokBuildModelCatalog(connection: AcpConnection) {
  try {
    return readGrokBuildListedModelState(
      await connection.extRequest(GROK_BUILD_MODELS_LIST_METHOD, {}),
    );
  } catch {
    return null;
  }
}

async function probeGrokBuildModels(
  connectionFactory: AcpConnectionFactory,
): Promise<CompatibleProviderModel[] | null> {
  const connection = await connectionFactory({
    args: GROK_BUILD_ARGS,
    command: GROK_BUILD_COMMAND,
    // The catalog is workspace-independent, so probe from the user's home
    // directory rather than tying it to whichever session opened first.
    cwd: homedir(),
    handlers: {
      onSessionUpdate() {},
      requestPermission() {
        return Promise.resolve({ outcome: { outcome: "cancelled" as const } });
      },
    },
  });

  try {
    const response = await connection.initialize({
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: { name: "Cocurdex", title: "Cocurdex", version: "0.0.0" },
      _meta: GROK_BUILD_INITIALIZE_META,
    });
    const listed = await fetchGrokBuildModelCatalog(connection);
    const initializeState = readAcpSessionModelState(response);
    const state = listed && listed.models.length > 0 ? listed : initializeState;
    if (!state || state.models.length === 0) {
      return null;
    }
    const now = new Date().toISOString();
    const defaultModelId =
      state.currentModelId ?? state.models[0]?.modelId ?? null;
    return state.models.map((model) =>
      toCompatibleModel(model, defaultModelId, now),
    );
  } finally {
    await connection.close();
  }
}

// Probing spawns a Grok process, so the catalog is resolved once per app run:
// Grok's model list changes on release cadence, not within a session.
let cachedCatalog: CompatibleProviderModel[] | null = null;
let inFlightProbe: Promise<CompatibleProviderModel[] | null> | null = null;

export async function listGrokBuildProviderModels(
  connectionFactory: AcpConnectionFactory = createSdkAcpConnection,
  options: { forceRefresh?: boolean } = {},
): Promise<CompatibleProviderModel[]> {
  if (cachedCatalog && !options.forceRefresh) {
    return cachedCatalog;
  }

  inFlightProbe ??= (async () => {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        probeGrokBuildModels(connectionFactory),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), PROBE_TIMEOUT_MS);
        }),
      ]);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  })();

  const probed = await inFlightProbe;
  inFlightProbe = null;
  if (probed) {
    cachedCatalog = probed;
    return probed;
  }
  if (options.forceRefresh && cachedCatalog) {
    throw new Error("Grok Build model catalog refresh returned no models");
  }
  return fallbackModels(new Date().toISOString());
}

export function resetGrokBuildProviderModelsCache() {
  cachedCatalog = null;
  inFlightProbe = null;
}
