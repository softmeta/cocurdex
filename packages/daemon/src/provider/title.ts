import { generatePiConversationTitle } from "@cocurdex/agent-adapters";
import type {
  TitleModelProbeResult,
  TitleModelSelection,
} from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../diagnostics";
import type { DaemonState } from "../state";
import { listConfiguredProviderModels } from "./models";

const TITLE_MODEL_SETTING_KEY = "titleModel";
const TITLE_PROBE_TIMEOUT_MS = 20_000;
const TITLE_PROBE_MESSAGE =
  "Hello, this is a connectivity check for the title generation model.";

type TitleModelState = Pick<
  DaemonState,
  | "getAppSetting"
  | "setAppSetting"
  | "getProviderConfig"
  | "listProviderConfigs"
  | "listProviderModels"
>;

export function parseTitleModelSetting(
  raw: string | null,
): TitleModelSelection | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<TitleModelSelection>;
    if (
      typeof parsed.providerId === "string" &&
      typeof parsed.modelId === "string"
    ) {
      return { providerId: parsed.providerId, modelId: parsed.modelId };
    }
  } catch {
    return null;
  }
  return null;
}

export async function getTitleModelSetting(
  state: Pick<DaemonState, "getAppSetting">,
): Promise<TitleModelSelection | null> {
  return parseTitleModelSetting(
    await state.getAppSetting(TITLE_MODEL_SETTING_KEY),
  );
}

export async function setTitleModelSetting(
  state: Pick<DaemonState, "setAppSetting">,
  selection: TitleModelSelection | null,
) {
  await state.setAppSetting(TITLE_MODEL_SETTING_KEY, JSON.stringify(selection));
}

export function isValidTitleModelSelection(
  selection: TitleModelSelection | null,
) {
  return (
    selection === null ||
    (typeof selection.providerId === "string" &&
      typeof selection.modelId === "string")
  );
}

export async function probeTitleModel(
  state: TitleModelState,
  readApiKey: (providerId: string) => Promise<string | null>,
  selection: TitleModelSelection,
): Promise<TitleModelProbeResult> {
  const startedAt = Date.now();

  const provider = await state.getProviderConfig(selection.providerId);
  const model = (
    await listConfiguredProviderModels(state, {
      providerIds: [selection.providerId],
    })
  ).find(
    (candidate) =>
      candidate.providerId === selection.providerId &&
      candidate.modelId === selection.modelId,
  );

  if (!provider || !model) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: "Model or provider not found",
    };
  }

  const apiKey = await readApiKey(provider.id);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TITLE_PROBE_TIMEOUT_MS);

  try {
    const title = await generatePiConversationTitle({
      provider,
      model,
      apiKey,
      message: TITLE_PROBE_MESSAGE,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    // Empty title still means the provider accepted the request and returned —
    // connectivity is fine; the model just produced no usable text.
    return { ok: true, latencyMs, title, error: null };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const aborted = controller.signal.aborted;
    const message = aborted
      ? "Request timed out"
      : error instanceof Error
        ? error.message
        : "Unknown error";
    logDaemonDiagnostic("info", "provider.titleModel.probeFailed", {
      durationMs: latencyMs,
      error: message,
      modelId: model.modelId,
      providerId: provider.id,
    });
    return { ok: false, latencyMs, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
