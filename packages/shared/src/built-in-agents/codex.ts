import type { BuiltInAgentManifest } from "./manifest";

const inSession = "in-session" as const;

export const codexManifest: BuiltInAgentManifest = {
  label: "Codex",
  transport: "native",
  planMode: true,
  writeModes: ["read-only", "native-write"],
  defaultWriteMode: "read-only",
  supportsSteering: true,
  sessionTitleStrategy: "adapter-generated",
  runtimeAxes: {
    model: inSession,
    thinking: inSession,
    permission: inSession,
    speed: inSession,
  },
  thinkingLevels: "reasoning-effort",
  fastMode: false,
  documentAttachments: false,
  modelCatalog: "agent",
  toolApprovals: true,
  disableable: true,
  planUsage: true,
  executable: "codex",
  minimumVersion: null,
  installHint: {
    command: "npm install -g @openai/codex",
    docsUrl: "https://developers.openai.com/codex/cli",
  },
  permissionModes: [
    { id: "codex-read-only", risk: "normal" },
    { id: "codex-auto", risk: "elevated" },
    { id: "codex-full-access", risk: "dangerous" },
  ],
  rsrsHost: "codex",
  acpRegistryEquivalents: ["codex-acp"],
  skills: {
    rootIds: ["agents", "codex"],
    invocation: (name) => `$${name} `,
  },
};
