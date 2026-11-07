import type { McpServerConfig, McpServerStatus } from "./mcp";

export const APPLICATION_CATALOG = [
  {
    id: "notion",
    name: "Notion",
    category: "knowledge",
    url: "https://mcp.notion.com/mcp",
    documentationUrl:
      "https://developers.notion.com/guides/mcp/get-started-with-mcp",
  },
  {
    id: "linear",
    name: "Linear",
    category: "development",
    url: "https://mcp.linear.app/mcp",
    documentationUrl: "https://linear.app/docs/mcp",
  },
  {
    id: "github",
    name: "GitHub",
    category: "development",
    url: "https://api.githubcopilot.com/mcp/",
    documentationUrl: "https://github.com/github/github-mcp-server",
  },
] as const;

export type ApplicationId = (typeof APPLICATION_CATALOG)[number]["id"];

export interface ApplicationMetadata {
  version: 1;
  applicationId: ApplicationId;
  displayName: string;
  personaIds: string[];
  allowDelegatedWork: boolean;
  allowWorkSessions: boolean;
  revision: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationConnection extends ApplicationMetadata {
  id: string;
  enabled: boolean;
  status: McpServerStatus | null;
}

export interface AddApplicationPayload {
  applicationId: ApplicationId;
  displayName: string;
  personaIds: string[];
  allowDelegatedWork: boolean;
  allowWorkSessions?: boolean;
}

export interface UpdateApplicationPayload {
  id: string;
  revision: string;
  displayName: string;
  personaIds: string[];
  allowDelegatedWork: boolean;
  allowWorkSessions?: boolean;
  enabled: boolean;
}

export interface ApplicationPrincipal {
  personaId: string | null;
  delegated: boolean;
  workSession: boolean;
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
    !["boolean", "undefined"].includes(typeof value.allowWorkSessions) ||
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
    allowWorkSessions: value.allowWorkSessions === true,
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

export function applicationAllows(
  config: McpServerConfig,
  principal: ApplicationPrincipal,
) {
  const metadata = readApplicationMetadata(config);
  if (config.enabled === false || metadata === null) return false;
  if (principal.personaId !== null)
    return (
      metadata.personaIds.includes(principal.personaId) &&
      (!principal.delegated || metadata.allowDelegatedWork)
    );
  return principal.workSession && metadata.allowWorkSessions;
}
