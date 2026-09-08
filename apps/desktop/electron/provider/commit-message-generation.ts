import { requestDaemon } from "@cocurdex/daemon/client";
import { app } from "electron";
import { resolveRuntimeProviderSnapshot } from "./provider-service";

export async function generateCommitMessageFromConfiguredModel(
  workspaceRootPath: string,
  options: { includeUnstaged: boolean },
): Promise<string> {
  const daemonOptions = { userDataPath: app.getPath("userData") };
  const model = await requestDaemon(
    "git.commitMessageModel.resolve",
    daemonOptions,
  );
  const providerConfig = await resolveRuntimeProviderSnapshot(
    model.providerSnapshot,
  );
  return requestDaemon(
    "git.generateCommitMessage",
    {
      workspaceRootPath,
      includeUnstaged: options.includeUnstaged,
      agentId: model.agentId,
      providerConfig,
    },
    daemonOptions,
  );
}
