import type { BuiltInAgentManifest } from "./manifest";

const inSession = "in-session" as const;

export const piManifest: BuiltInAgentManifest = {
  label: "Pi",
  transport: "native",
  planMode: false,
  writeModes: ["read-only"],
  defaultWriteMode: "read-only",
  supportsSteering: true,
  sessionTitleStrategy: "app-generated",
  runtimeAxes: { model: inSession, thinking: inSession },
  thinkingLevels: "app",
  fastMode: false,
  documentAttachments: false,
  modelCatalog: "app-providers",
  toolApprovals: false,
  disableable: false,
  planUsage: false,
  executable: null,
  minimumVersion: null,
  installHint: null,
  permissionModes: [],
  rsrsHost: "pi",
  acpRegistryEquivalents: ["pi-acp"],
  skills: {
    rootIds: ["agents"],
    invocation: (name) => `/skill:${name} `,
  },
};
