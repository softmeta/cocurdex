import type { BuiltInAgentManifest } from "./manifest";

const inSession = "in-session" as const;

export const opencodeManifest: BuiltInAgentManifest = {
  label: "OpenCode",
  transport: "native",
  planMode: true,
  writeModes: ["read-only", "native-write"],
  defaultWriteMode: "read-only",
  supportsSteering: false,
  sessionTitleStrategy: "native",
  runtimeAxes: {
    model: inSession,
    agent: inSession,
    variant: inSession,
    permission: inSession,
  },
  thinkingLevels: null,
  fastMode: false,
  documentAttachments: true,
  modelCatalog: "agent-providers",
  toolApprovals: true,
  disableable: true,
  planUsage: false,
  executable: "opencode",
  minimumVersion: "2.0.20",
  installHint: {
    command: "curl -fsSL https://opencode.ai/install | bash",
    docsUrl: "https://opencode.ai/docs",
  },
  permissionModes: [
    { id: "opencode-ask", risk: "normal" },
    { id: "opencode-allow", risk: "elevated" },
    { id: "opencode-deny", risk: "normal" },
  ],
  rsrsHost: "opencode",
  acpRegistryEquivalents: ["opencode"],
  skills: {
    homeDirs: [
      [".agents", "skills"],
      [".config", "opencode", "skills"],
      [".opencode", "skills"],
    ],
    workspaceDirs: [
      [".agents", "skills"],
      [".opencode", "skills"],
    ],
    invocation: (name) => `Use the \`${name}\` skill. `,
  },
};
