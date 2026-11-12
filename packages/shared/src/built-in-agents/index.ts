import type { BuiltInAgentId } from "../agent-identity";
import { claudeAgentManifest } from "./claude-agent";
import { codexManifest } from "./codex";
import type { BuiltInAgentManifest } from "./manifest";
import { opencodeManifest } from "./opencode";
import { piManifest } from "./pi";

export type {
  AgentInstallHint,
  AgentModelCatalog,
  AgentModelIdentity,
  AgentSkillConvention,
  AgentThinkingLevelSource,
  AgentTraits,
  BuiltInAgentManifest,
} from "./manifest";

export const builtInAgentManifests: Readonly<
  Record<BuiltInAgentId, BuiltInAgentManifest>
> = {
  "claude-agent": claudeAgentManifest,
  codex: codexManifest,
  opencode: opencodeManifest,
  pi: piManifest,
};
