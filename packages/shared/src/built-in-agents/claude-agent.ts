import type { BuiltInAgentManifest } from "./manifest";

const inSession = "in-session" as const;

function isHaikuModel(value: string | null | undefined) {
  return Boolean(value && /(^|[^a-z0-9])haiku([^a-z0-9]|$)/i.test(value));
}

export const claudeAgentManifest: BuiltInAgentManifest = {
  label: "Claude Agent",
  transport: "native",
  planMode: true,
  writeModes: ["read-only", "native-write"],
  defaultWriteMode: "native-write",
  supportsSteering: true,
  sessionTitleStrategy: "adapter-generated",
  runtimeAxes: {
    model: inSession,
    thinking: inSession,
    permission: inSession,
    speed: inSession,
  },
  thinkingLevels: "adapter",
  fastMode: true,
  documentAttachments: true,
  modelCatalog: "agent",
  toolApprovals: true,
  disableable: true,
  planUsage: true,
  executable: "claude",
  minimumVersion: "2.0.0",
  installHint: {
    command: "npm install -g @anthropic-ai/claude-code",
    docsUrl: "https://docs.claude.com/en/docs/claude-code/setup",
  },
  permissionModes: [
    { id: "claude-default", risk: "normal" },
    { id: "claude-accept-edits", risk: "elevated" },
    { id: "claude-bypass-permissions", risk: "dangerous" },
  ],
  supportsPermissionMode: (mode, model) =>
    mode !== "claude-auto" ||
    (!isHaikuModel(model.id) && !isHaikuModel(model.name)),
  rsrsHost: "claude",
  acpRegistryEquivalents: ["claude-acp"],
  skills: {
    rootIds: ["agents", "claude"],
    invocation: (name) => `/${name} `,
  },
};
