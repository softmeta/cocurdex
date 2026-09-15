import { generateAgentCommitMessage } from "@cocurdex/agent-adapters";
import type {
  AgentProviderSnapshot,
  AgentRuntimeProviderConfig,
  CommitMessageModelSelection,
  GenerateGitCommitMessagePayload,
} from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../diagnostics";
import type { DaemonState } from "../state";
import { collectCommitChangeSummary } from "./git-summary";
import { resolveCommitMessageModel } from "./model";
import { parseCommitMessageModelSetting } from "./settings";

export class DaemonCommitMessageService {
  constructor(
    private readonly state: DaemonState,
    private readonly resolveRuntimeProviderConfig?: (
      snapshot: AgentProviderSnapshot,
    ) => Promise<AgentRuntimeProviderConfig>,
  ) {}
  async getModelSetting() {
    return parseCommitMessageModelSetting(
      await this.state.getAppSetting("commitMessageModel"),
    );
  }
  async setModelSetting(selection: CommitMessageModelSelection | null) {
    await this.state.setAppSetting(
      "commitMessageModel",
      JSON.stringify(selection),
    );
    return null;
  }
  async resolveModel() {
    return resolveCommitMessageModel(this.state, await this.getModelSetting());
  }
  async generate(input: GenerateGitCommitMessagePayload) {
    await this.state.getChatDatabase();
    let agentId = input.agentId;
    let providerConfig = input.providerConfig;
    if (!providerConfig) {
      if (!this.resolveRuntimeProviderConfig) {
        throw new Error(
          "providerConfig is required; no provider snapshot resolver is configured",
        );
      }
      const model = await this.resolveModel();
      agentId ??= model.agentId;
      providerConfig = await this.resolveRuntimeProviderConfig(
        model.providerSnapshot,
      );
    }
    if (!agentId) {
      throw new Error("agentId is required to generate a commit message");
    }
    const changeSummary = await collectCommitChangeSummary(
      input.workspaceRootPath,
      input.includeUnstaged,
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const { apiKey: _apiKey, ...providerSnapshot } = providerConfig;
    try {
      const message = await generateAgentCommitMessage({
        agentId,
        providerSnapshot,
        providerConfig,
        workspaceRootPath: input.workspaceRootPath,
        changeSummary,
        signal: controller.signal,
        onDiagnostic: (event, details) => {
          logDaemonDiagnostic("info", `commitMessage.agent.${event}`, {
            ...details,
            agentId,
            modelId: providerSnapshot.modelId,
          });
        },
      });
      if (!message)
        throw new Error("Model returned an incomplete commit message");
      return message;
    } finally {
      clearTimeout(timeout);
    }
  }
}
