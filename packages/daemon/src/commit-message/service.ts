import { generateAgentCommitMessage } from "@cocurdex/agent-adapters";
import type {
  CommitMessageModelSelection,
  GenerateGitCommitMessagePayload,
} from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../diagnostics";
import type { DaemonState } from "../state";
import { collectCommitChangeSummary } from "./git-summary";
import { resolveCommitMessageModel } from "./model";
import { parseCommitMessageModelSetting } from "./settings";

export class DaemonCommitMessageService {
  constructor(private readonly state: DaemonState) {}
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
    const changeSummary = await collectCommitChangeSummary(
      input.workspaceRootPath,
      input.includeUnstaged,
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const { apiKey: _apiKey, ...providerSnapshot } = input.providerConfig;
    try {
      const message = await generateAgentCommitMessage({
        agentId: input.agentId,
        providerSnapshot,
        providerConfig: input.providerConfig,
        workspaceRootPath: input.workspaceRootPath,
        changeSummary,
        signal: controller.signal,
        onDiagnostic: (event, details) => {
          logDaemonDiagnostic("info", `commitMessage.agent.${event}`, {
            ...details,
            agentId: input.agentId,
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
