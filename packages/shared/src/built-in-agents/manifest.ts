import type {
  AgentCapabilities,
  AgentPermissionMode,
  AgentPermissionModeOption,
  AgentRuntimeAxisCapabilities,
  SessionTitleStrategy,
  WriteMode,
} from "../contracts";
import type { SkillRootId } from "../skill-library";

export type AgentThinkingLevelSource = "reasoning-effort" | "app" | "adapter";

export type AgentModelCatalog = "agent" | "agent-providers" | "app-providers";

export interface AgentTraits {
  label: string;
  transport: AgentCapabilities["transport"];
  planMode: boolean;
  writeModes: readonly WriteMode[];
  defaultWriteMode: WriteMode;
  supportsSteering: boolean;
  sessionTitleStrategy: SessionTitleStrategy;
  runtimeAxes: AgentRuntimeAxisCapabilities;
  thinkingLevels: AgentThinkingLevelSource | null;
  fastMode: boolean;
  documentAttachments: boolean;
  modelCatalog: AgentModelCatalog;
  toolApprovals: boolean;
  disableable: boolean;
  planUsage: boolean;
}

export interface AgentInstallHint {
  command: string;
  docsUrl: string;
}

export interface AgentModelIdentity {
  id?: string | null;
  name?: string | null;
}

export interface AgentSkillConvention {
  rootIds: readonly SkillRootId[];
  invocation(skillName: string): string;
}

export interface BuiltInAgentManifest extends AgentTraits {
  executable: string | null;
  minimumVersion: string | null;
  installHint: AgentInstallHint | null;
  permissionModes: readonly AgentPermissionModeOption[];
  supportsPermissionMode?(
    mode: AgentPermissionMode,
    model: AgentModelIdentity,
  ): boolean;
  rsrsHost: string;
  acpRegistryEquivalents: readonly string[];
  skills: AgentSkillConvention;
}
