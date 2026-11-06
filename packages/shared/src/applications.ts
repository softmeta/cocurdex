import type { McpServerConfig, McpServerStatus } from "./mcp";

export const APPLICATION_CATALOG = [
  {
    id: "notion",
    name: "Notion",
    category: "knowledge",
    url: "https://mcp.notion.com/mcp",
    documentationUrl:
      "https://developers.notion.com/guides/mcp/get-started-with-mcp",
    requiresClient: false,
  },
  {
    id: "linear",
    name: "Linear",
    category: "development",
    url: "https://mcp.linear.app/mcp",
    documentationUrl: "https://linear.app/docs/mcp",
    requiresClient: false,
  },
  {
    id: "github",
    name: "GitHub",
    category: "development",
    url: "https://api.githubcopilot.com/mcp/",
    documentationUrl: "https://github.com/github/github-mcp-server",
    requiresClient: true,
  },
] as const;

export type ApplicationId = (typeof APPLICATION_CATALOG)[number]["id"];

export interface ApplicationMetadata {
  version: 1;
  applicationId: ApplicationId;
  displayName: string;
  personaIds: string[];
  allowDelegatedWork: boolean;
  revision: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationConnection extends ApplicationMetadata {
  id: string;
  enabled: boolean;
  configured: boolean;
  clientId: string | null;
  callbackPort: number | null;
  status: McpServerStatus | null;
}

export interface AddApplicationPayload {
  applicationId: ApplicationId;
  displayName: string;
  personaIds: string[];
  allowDelegatedWork: boolean;
}

export interface UpdateApplicationPayload {
  id: string;
  revision: string;
  displayName: string;
  personaIds: string[];
  allowDelegatedWork: boolean;
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
  callbackPort?: number;
}

export interface ApplicationTool {
  name: string;
  description: string | null;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isManagedApplicationServer(config: McpServerConfig) {
  return (
    isRecord(config.cocurdex) && Object.hasOwn(config.cocurdex, "application")
  );
}

export function readApplicationMetadata(
  config: McpServerConfig,
): ApplicationMetadata | null {
  if (!isRecord(config.cocurdex)) return null;
  const value = config.cocurdex.application;
  if (!isRecord(value)) return null;
  const app = APPLICATION_CATALOG.find(
    (item) => item.id === value.applicationId,
  );
  if (
    !app ||
    value.version !== 1 ||
    typeof value.displayName !== "string" ||
    !value.displayName.trim() ||
    !Array.isArray(value.personaIds) ||
    !value.personaIds.every((id) => typeof id === "string" && id.length > 0) ||
    typeof value.allowDelegatedWork !== "boolean" ||
    typeof value.revision !== "string" ||
    !value.revision ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  )
    return null;
  return {
    version: 1,
    applicationId: app.id,
    displayName: value.displayName,
    personaIds: value.personaIds,
    allowDelegatedWork: value.allowDelegatedWork,
    revision: value.revision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function withApplicationMetadata(
  config: McpServerConfig,
  metadata: ApplicationMetadata,
): McpServerConfig {
  const extension = isRecord(config.cocurdex) ? config.cocurdex : {};
  return { ...config, cocurdex: { ...extension, application: metadata } };
}

export function applicationAllowsPersona(
  config: McpServerConfig,
  personaId: string | null,
  delegated: boolean,
) {
  const metadata = readApplicationMetadata(config);
  return (
    config.enabled !== false &&
    metadata !== null &&
    personaId !== null &&
    metadata.personaIds.includes(personaId) &&
    (!delegated || metadata.allowDelegatedWork)
  );
}
