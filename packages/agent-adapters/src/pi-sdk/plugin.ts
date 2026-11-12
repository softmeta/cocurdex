import type { AgentRuntimePlugin } from "../agent-plugin";
import { createPiSdkAdapter } from "./pi-sdk-adapter";

export const piPlugin: AgentRuntimePlugin = {
  createAdapter: createPiSdkAdapter,
  slashCommands: "adapter",
};
