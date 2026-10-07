import {
  generateCodexConversationTitle,
  generatePiConversationTitle,
} from "@cocurdex/agent-adapters";
import type {
  AgentRuntimeProviderConfig,
  ProviderConfigRecord,
  ProviderModelRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { errorKindForLog, hostForLog } from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../diagnostics";
import {
  findConfiguredProviderModel,
  type ProviderModelState,
} from "./configured-model";
import { getTitleModelSetting } from "./title";

const TITLE_GENERATION_TIMEOUT_MS = 60_000;

interface TitleModelRecords {
  provider: ProviderConfigRecord;
  model: ProviderModelRecord;
  apiKey: string | null;
}

export interface SessionTitleDeps {
  state: ProviderModelState;
  readApiKey(providerId: string): Promise<string | null>;
  resolveSessionProvider(
    session: SessionRecord,
  ): Promise<AgentRuntimeProviderConfig | null>;
}

function buildSnapshotProviderRecords(runtime: AgentRuntimeProviderConfig): {
  provider: ProviderConfigRecord;
  model: ProviderModelRecord;
} {
  const now = new Date().toISOString();
  const provider: ProviderConfigRecord = {
    id: runtime.providerId,
    name: runtime.providerName,
    baseUrl: runtime.modelBaseUrl || runtime.baseUrl,
    enabled: true,
    apiKeySecretId: null,
    headersJson: runtime.headersJson ?? null,
    compatJson: runtime.providerCompatJson ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const model: ProviderModelRecord = {
    providerId: runtime.providerId,
    modelId: runtime.modelId,
    name: runtime.modelName,
    api: runtime.api,
    enabled: true,
    source: "manual",
    baseUrl: runtime.modelBaseUrl ?? null,
    createdAt: now,
    updatedAt: now,
  };
  return { provider, model };
}

async function resolveDedicatedTitleModel(
  deps: SessionTitleDeps,
): Promise<TitleModelRecords | null> {
  const selection = await getTitleModelSetting(deps.state);
  if (!selection) {
    return null;
  }
  const { provider, model } = await findConfiguredProviderModel(
    deps.state,
    selection.providerId,
    selection.modelId,
  );
  if (!provider || !model) {
    logDaemonDiagnostic("info", "titleGeneration.dedicatedModelUnresolved", {
      modelId: selection.modelId,
      providerId: selection.providerId,
    });
    return null;
  }
  return { provider, model, apiKey: await deps.readApiKey(provider.id) };
}

async function resolveSessionTitleModel(
  deps: SessionTitleDeps,
  session: SessionRecord,
): Promise<TitleModelRecords | null> {
  const runtime = await deps.resolveSessionProvider(session);
  if (!runtime?.baseUrl || !runtime.modelId) {
    return null;
  }
  const configured = await findConfiguredProviderModel(
    deps.state,
    runtime.providerId,
    runtime.modelId,
  );
  const records =
    configured.provider && configured.model
      ? { provider: configured.provider, model: configured.model }
      : buildSnapshotProviderRecords(runtime);
  return { ...records, apiKey: runtime.apiKey };
}

export async function generateProviderSessionTitle(
  deps: SessionTitleDeps,
  session: SessionRecord,
  payload: { message: string; fallbackTitle: string },
): Promise<string | null> {
  const useCodexCli = session.agentType === "codex";
  const records =
    session.agentType === "pi"
      ? ((await resolveDedicatedTitleModel(deps)) ??
        (await resolveSessionTitleModel(deps, session)))
      : null;
  if (!records && !useCodexCli) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    TITLE_GENERATION_TIMEOUT_MS,
  );
  const startedAt = Date.now();
  try {
    let generated: string | null;
    if (useCodexCli) {
      const modelId = session.providerSnapshot?.modelId;
      generated = await generateCodexConversationTitle({
        message: payload.message,
        ...(modelId ? { model: modelId } : {}),
        signal: controller.signal,
      });
    } else if (records) {
      generated = await generatePiConversationTitle({
        provider: records.provider,
        model: records.model,
        apiKey: records.apiKey,
        message: payload.message,
        signal: controller.signal,
      });
    } else {
      return null;
    }
    return generated ?? payload.fallbackTitle;
  } catch (error) {
    logDaemonDiagnostic("info", "titleGeneration.skipped", {
      durationMs: Date.now() - startedAt,
      endpointHost: hostForLog(
        records?.model.baseUrl ?? records?.provider.baseUrl,
      ),
      error: error instanceof Error ? error.message : "Unknown error",
      errorKind: errorKindForLog(error),
      sessionId: session.id,
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
