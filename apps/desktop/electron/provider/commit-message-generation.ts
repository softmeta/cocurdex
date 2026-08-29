import { generateAgentCommitMessage } from "@cocurdex/agent-adapters";
import type {
  AgentProviderSnapshot,
  AgentRuntimeProviderConfig,
  CommitMessageModelSelection,
  ProviderConfigRecord,
} from "@cocurdex/shared";
import { safeStorage } from "electron";
import { getCommitMessageModelSetting, getProviderSecret } from "../chat";
import { createLogger } from "../logging";
import type { GitNameStatusChange } from "../workspace/git-name-status";
import { buildCompatibleProviderModels } from "./provider-service";

const commitMessageLogger = createLogger("commit-message-provider");
const COMMIT_MESSAGE_GENERATION_TIMEOUT_MS = 60_000;
const MAX_CHANGE_SUMMARY_CHARS = 24_000;

const NO_MODEL_CONFIGURED_ERROR =
  "No commit message model configured. Choose one in Settings → Git, or enter a message.";

async function resolveProviderApiKey(config: ProviderConfigRecord) {
  if (!config.apiKeySecretId) {
    return null;
  }

  const secret = await getProviderSecret(config.apiKeySecretId);
  if (!secret) {
    return null;
  }

  const buffer = Buffer.from(secret.encryptedValue, "base64");
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(buffer);
  }
  return buffer.toString("utf8");
}

export function createCommitMessageProviderSnapshot(
  provider: ProviderConfigRecord,
  model: Awaited<
    ReturnType<typeof buildCompatibleProviderModels>
  >[number]["model"],
  selection: CommitMessageModelSelection,
): AgentProviderSnapshot {
  return {
    providerId: provider.id,
    providerName: provider.name,
    modelId: model.modelId,
    modelName: model.name,
    api: model.api,
    baseUrl: provider.baseUrl,
    modelBaseUrl: model.baseUrl ?? null,
    headersJson: provider.headersJson ?? null,
    providerCompatJson: provider.compatJson ?? null,
    modelCapabilities: model.capabilities,
    modelThinkingLevelMapJson: model.thinkingLevelMapJson ?? null,
    supportedReasoningEfforts: model.supportedReasoningEfforts,
    supportsReasoning: model.reasoning ?? false,
    modelCostJson: model.costJson ?? null,
    modelCompatJson: model.compatJson ?? null,
    modelContextWindow: model.contextLimit ?? null,
    modelMaxTokens: model.outputLimit ?? null,
    reasoningEffort: selection.reasoningEffort ?? null,
    thinkingLevel: selection.thinkingLevel ?? null,
    serviceTier: selection.serviceTier ?? null,
    fastMode: selection.fastMode ?? null,
    openCodeAgent: selection.openCodeAgent ?? null,
    openCodeVariant: selection.openCodeVariant ?? null,
  };
}

// Resolve through the same per-agent catalog as the new-session model picker.
async function resolveCommitMessageModel(): Promise<{
  providerSnapshot: AgentProviderSnapshot;
  providerConfig: AgentRuntimeProviderConfig;
  selection: CommitMessageModelSelection;
} | null> {
  let selection: CommitMessageModelSelection | null;
  try {
    selection = await getCommitMessageModelSetting();
  } catch (error) {
    commitMessageLogger.debug("commitMessage.settingUnavailable", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
  if (!selection) {
    return null;
  }

  try {
    const item = (await buildCompatibleProviderModels(selection.agentId)).find(
      ({ provider, model }) =>
        provider.id === selection.providerId &&
        model.modelId === selection.modelId,
    );

    if (!item) {
      commitMessageLogger.debug("commitMessage.modelUnresolved", {
        agentId: selection.agentId,
        modelId: selection.modelId,
        providerId: selection.providerId,
      });
      return null;
    }

    const providerSnapshot = createCommitMessageProviderSnapshot(
      item.provider,
      item.model,
      selection,
    );
    const apiKey = await resolveProviderApiKey(item.provider);
    return {
      providerSnapshot,
      providerConfig: { ...providerSnapshot, apiKey },
      selection,
    };
  } catch (error) {
    commitMessageLogger.debug("commitMessage.resolveFailed", {
      error: error instanceof Error ? error.message : "Unknown error",
      modelId: selection.modelId,
      providerId: selection.providerId,
    });
    return null;
  }
}

export function buildCommitChangeSummary(
  changes: readonly GitNameStatusChange[],
  stagedDiff: string,
): string {
  const lines = changes.map((change) => {
    if (change.fromPath) {
      return `${change.status}\t${change.fromPath}\t${change.path}`;
    }
    return `${change.status}\t${change.path}`;
  });
  const nameStatus = lines.join("\n");
  const body = `Staged paths:\n${nameStatus}\n\nStaged diff:\n${stagedDiff.trim()}`;
  if (body.length <= MAX_CHANGE_SUMMARY_CHARS) {
    return `Staged changes (${changes.length} path(s)):\n${body}`;
  }
  return `Staged changes (${changes.length} path(s), truncated):\n${body.slice(0, MAX_CHANGE_SUMMARY_CHARS)}…`;
}

// One-shot Conventional Commits subject from the configured model. Never
// creates a chat session. Throws when unset, unresolvable, or the model fails.
export async function generateCommitMessageFromConfiguredModel(
  workspaceRootPath: string,
  changes: readonly GitNameStatusChange[],
  stagedDiff: string,
): Promise<string> {
  if (changes.length === 0) {
    throw new Error("Nothing to commit");
  }

  const records = await resolveCommitMessageModel();
  if (!records) {
    throw new Error(NO_MODEL_CONFIGURED_ERROR);
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    COMMIT_MESSAGE_GENERATION_TIMEOUT_MS,
  );
  const startedAt = Date.now();

  try {
    commitMessageLogger.debug("commitMessage.requestStarted", {
      agentId: records.selection.agentId,
      changeCount: changes.length,
      modelId: records.providerSnapshot.modelId,
      providerId: records.providerSnapshot.providerId,
    });
    const message = await generateAgentCommitMessage({
      agentId: records.selection.agentId,
      providerSnapshot: records.providerSnapshot,
      providerConfig: records.providerConfig,
      workspaceRootPath,
      changeSummary: buildCommitChangeSummary(changes, stagedDiff),
      signal: controller.signal,
      onDiagnostic: (event, details) => {
        commitMessageLogger.info(`commitMessage.agent.${event}`, {
          ...details,
          agentId: records.selection.agentId,
          modelId: records.providerSnapshot.modelId,
        });
      },
    });
    commitMessageLogger.debug("commitMessage.completed", {
      durationMs: Date.now() - startedAt,
      hasMessage: Boolean(message),
      modelId: records.providerSnapshot.modelId,
    });
    if (!message) {
      throw new Error("Model returned an incomplete commit message");
    }
    return message;
  } catch (error) {
    commitMessageLogger.info("commitMessage.failed", {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Unknown error",
      modelId: records.providerSnapshot.modelId,
    });
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to generate commit message");
  } finally {
    clearTimeout(timeout);
  }
}
