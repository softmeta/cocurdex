import {
  AGENT_TOOL_TOKEN_ENV,
  AGENT_TOOL_USER_DATA_PATH_ENV,
  type AgentToolStdioServerSpec,
} from "@cocurdex/shared";

export const AGENT_TOOLS_SUBCOMMAND = "agent-tools";

export interface AgentToolStdioSpecInput {
  execPath: string;
  execArgv: readonly string[];
  entryPath: string;
  token: string;
  userDataPath: string;
}

export function buildAgentToolStdioSpec(
  input: AgentToolStdioSpecInput,
): AgentToolStdioServerSpec {
  return {
    command: input.execPath,
    args: [...input.execArgv, input.entryPath, AGENT_TOOLS_SUBCOMMAND],
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      [AGENT_TOOL_TOKEN_ENV]: input.token,
      [AGENT_TOOL_USER_DATA_PATH_ENV]: input.userDataPath,
    },
  };
}
