import type { AgentRuntimePlugin } from "../agent-plugin";
import {
  createOpencodeAdapter,
  deleteOpenCodeSession,
} from "./opencode-adapter";
import { listOpenCodeProviderModels } from "./opencode-models";

export const opencodePlugin: AgentRuntimePlugin = {
  createAdapter: createOpencodeAdapter,
  slashCommands: "skills",
  listModels: listOpenCodeProviderModels,
  deleteProviderSession: (providerSessionId) =>
    deleteOpenCodeSession({ providerSessionId }),
};
