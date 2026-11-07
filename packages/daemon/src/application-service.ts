import { randomUUID } from "node:crypto";
import { createPiApplicationClient } from "@cocurdex/agent-adapters/pi-mcp";
import {
  type AddApplicationPayload,
  APPLICATION_CATALOG,
  type ApplicationConnection,
  applicationAllowsPersona,
  type McpServerConfig,
  type McpServerStatus,
  readApplicationMetadata,
  type UpdateApplicationPayload,
  withApplicationMetadata,
} from "@cocurdex/shared";
import type { DaemonMcpService } from "./mcp-service";

type ApplicationClient = ReturnType<typeof createPiApplicationClient>;

export interface ApplicationPrincipal {
  personaId: string | null;
  delegated: boolean;
}

function connectionRevision(config: McpServerConfig) {
  const { cocurdex: _metadata, enabled, ...connection } = config;
  return JSON.stringify({ ...connection, enabled: enabled !== false });
}

export class ApplicationService {
  private readonly statuses = new Map<
    string,
    { revision: string; status: McpServerStatus }
  >();
  private readonly logins = new Map<string, string>();
  private readonly clients = new Map<string, Set<ApplicationClient>>();

  constructor(
    private readonly mcp: DaemonMcpService,
    private readonly personaExists: (id: string) => Promise<boolean>,
    private readonly clientFactory = createPiApplicationClient,
    private readonly announceChanged: () => void = () => {},
  ) {}

  async list(
    principal?: ApplicationPrincipal,
  ): Promise<ApplicationConnection[]> {
    const servers = await this.mcp.config.readServers();
    return Object.entries(servers).flatMap(([id, config]) => {
      const metadata = readApplicationMetadata(config);
      if (
        !metadata ||
        (principal &&
          !applicationAllowsPersona(
            config,
            principal.personaId,
            principal.delegated,
          ))
      )
        return [];
      const oauth = this.oauth(config);
      const checked = this.statuses.get(id);
      return [
        {
          ...metadata,
          id,
          enabled: config.enabled !== false,
          configured:
            metadata.applicationId !== "github" ||
            (typeof oauth.clientId === "string" &&
              !!oauth.clientId &&
              typeof oauth.callbackPort === "number"),
          clientId: typeof oauth.clientId === "string" ? oauth.clientId : null,
          callbackPort:
            typeof oauth.callbackPort === "number" ? oauth.callbackPort : null,
          status:
            checked?.revision === connectionRevision(config)
              ? checked.status
              : null,
        },
      ];
    });
  }

  async add(payload: AddApplicationPayload) {
    await this.validatePersonas(payload.personaIds);
    const app = APPLICATION_CATALOG.find(
      (item) => item.id === payload.applicationId,
    );
    if (!app) throw new Error("Unknown application");
    const now = new Date().toISOString();
    const id = `app-${app.id}-${randomUUID()}`;
    await this.mcp.config.saveServer(
      id,
      withApplicationMetadata(
        {
          url: app.url,
          oauth: { clientName: "Cocurdex" },
          cocurdex: { agents: [] },
        },
        {
          version: 1,
          applicationId: app.id,
          displayName: payload.displayName.trim() || app.name,
          personaIds: [...new Set(payload.personaIds)],
          allowDelegatedWork: payload.allowDelegatedWork,
          revision: randomUUID(),
          createdAt: now,
          updatedAt: now,
        },
      ),
    );
    this.announceChanged();
    return this.connection(id);
  }

  async update(payload: UpdateApplicationPayload) {
    await this.validatePersonas(payload.personaIds);
    await this.cancelFor(payload.id);
    await this.closeClients(payload.id);
    if (payload.clientId !== undefined || payload.clientSecret !== undefined) {
      const current = await this.require(payload.id);
      if (this.metadata(current).revision !== payload.revision)
        throw new Error("Application changed. Reload before saving.");
      const oauth = this.oauth(current);
      if (
        (payload.clientId !== undefined &&
          payload.clientId.trim() !== oauth.clientId) ||
        (payload.clientSecret !== undefined &&
          payload.clientSecret !== oauth.clientSecret)
      )
        await this.mcp.logout(payload.id);
    }
    await this.mcp.config.updateServer(payload.id, (config) => {
      const metadata = this.metadata(config);
      if (metadata.revision !== payload.revision)
        throw new Error("Application changed. Reload before saving.");
      const oauth = this.oauth(config);
      if (metadata.applicationId === "github") {
        if (payload.clientId !== undefined)
          oauth.clientId = payload.clientId.trim();
        if (payload.clientSecret !== undefined)
          oauth.clientSecret = payload.clientSecret;
        if (payload.callbackPort !== undefined)
          oauth.callbackPort = payload.callbackPort;
      }
      return withApplicationMetadata(
        { ...config, enabled: payload.enabled, oauth },
        {
          ...metadata,
          displayName: payload.displayName.trim() || metadata.displayName,
          personaIds: [...new Set(payload.personaIds)],
          allowDelegatedWork: payload.allowDelegatedWork,
          revision: randomUUID(),
          updatedAt: new Date().toISOString(),
        },
      );
    });
    this.announceChanged();
    return this.connection(payload.id);
  }

  async remove(id: string) {
    await this.require(id);
    await this.cancelFor(id);
    await this.closeClients(id);
    await this.mcp.logout(id);
    await this.mcp.config.removeServer(id);
    this.statuses.delete(id);
    this.announceChanged();
  }

  async logout(id: string) {
    await this.require(id);
    await this.cancelFor(id);
    await this.closeClients(id);
    await this.mcp.logout(id);
    this.statuses.delete(id);
    this.announceChanged();
    return this.connection(id);
  }

  async check(id: string) {
    const config = await this.require(id);
    const connection = await this.connection(id);
    if (!connection.configured)
      throw new Error(
        "Register your GitHub OAuth app and configure its client ID and callback port first.",
      );
    const status = await this.mcp.test(id, config);
    this.statuses.set(id, { revision: connectionRevision(config), status });
    this.announceChanged();
    return this.connection(id);
  }

  async startLogin(id: string) {
    const config = await this.require(id);
    this.assertEnabled(config);
    if (!(await this.connection(id)).configured)
      throw new Error("Configure your GitHub OAuth app first.");
    await this.cancelFor(id);
    const result = await this.mcp.startLogin(id, undefined, config);
    if (result.loginId) this.logins.set(result.loginId, id);
    return result;
  }

  async waitLogin(id: string, loginId: string) {
    this.requireLogin(id, loginId);
    try {
      return await this.mcp.logins.wait(loginId);
    } finally {
      this.logins.delete(loginId);
      this.statuses.delete(id);
      this.announceChanged();
    }
  }

  submitRedirect(id: string, loginId: string, url: string) {
    this.requireLogin(id, loginId);
    this.mcp.logins.submitRedirectUrl(loginId, url);
  }

  cancelLogin(id: string, loginId: string) {
    this.requireLogin(id, loginId);
    this.mcp.logins.cancel(loginId);
    this.logins.delete(loginId);
  }

  async tools(id: string, principal?: ApplicationPrincipal) {
    const config = await this.require(id, principal);
    this.assertEnabled(config);
    const client = await this.client(id, config);
    try {
      const tools = await client.tools();
      await this.require(id, principal);
      this.assertActive(id, client);
      return tools;
    } finally {
      await this.releaseClient(id, client);
    }
  }

  read(
    id: string,
    tool: string,
    args: Record<string, unknown>,
    principal?: ApplicationPrincipal,
  ) {
    return this.execute(id, tool, args, principal, true);
  }

  call(
    id: string,
    tool: string,
    args: Record<string, unknown>,
    principal?: ApplicationPrincipal,
  ) {
    return this.execute(id, tool, args, principal, false);
  }

  private async execute(
    id: string,
    tool: string,
    args: Record<string, unknown>,
    principal: ApplicationPrincipal | undefined,
    readOnly: boolean,
  ) {
    const config = await this.require(id, principal);
    this.assertEnabled(config);
    const client = await this.client(id, config);
    try {
      const tools = await client.tools();
      const selected = tools.find((item) => item.name === tool);
      if (!selected) throw new Error("Unknown application tool");
      if (readOnly && !selected.readOnly)
        throw new Error(
          "This tool is not declared read-only. Describe the action for the user instead.",
        );
      const current = await this.require(id, principal);
      if (JSON.stringify(current) !== JSON.stringify(config))
        throw new Error("Application configuration changed. Try again.");
      this.assertActive(id, client);
      return await client.call(tool, args);
    } finally {
      await this.releaseClient(id, client);
    }
  }

  async dispose() {
    await Promise.all(
      [...this.clients.keys()].map((id) => this.closeClients(id)),
    );
  }

  private assertEnabled(config: McpServerConfig) {
    if (config.enabled === false) throw new Error("Application is disabled");
  }

  private async client(id: string, config: McpServerConfig) {
    const client = this.clientFactory(await this.mcp.location(), id, config);
    const clients = this.clients.get(id) ?? new Set<ApplicationClient>();
    clients.add(client);
    this.clients.set(id, clients);
    return client;
  }

  private assertActive(id: string, client: ApplicationClient) {
    if (!this.clients.get(id)?.has(client))
      throw new Error(
        "Application connection was closed. Check its authorization before trying again.",
      );
  }

  private async releaseClient(id: string, client: ApplicationClient) {
    const clients = this.clients.get(id);
    if (!clients?.delete(client)) return;
    if (!clients.size) this.clients.delete(id);
    await client.close();
  }

  private async closeClients(id: string) {
    const clients = this.clients.get(id);
    if (!clients) return;
    this.clients.delete(id);
    await Promise.all([...clients].map((client) => client.close()));
  }

  private async connection(id: string) {
    const value = (await this.list()).find((item) => item.id === id);
    if (!value) throw new Error("Application connection not found");
    return value;
  }

  private metadata(config: McpServerConfig) {
    const value = readApplicationMetadata(config);
    if (!value)
      throw new Error(
        "Invalid application metadata. Review the advanced MCP configuration.",
      );
    const app = APPLICATION_CATALOG.find(
      (item) => item.id === value.applicationId,
    );
    if (
      config.url !== app?.url ||
      config.command !== undefined ||
      config.headers !== undefined ||
      config.auth !== undefined
    )
      throw new Error(
        "Managed application endpoint was changed. Review the advanced MCP configuration.",
      );
    return value;
  }

  private async require(id: string, principal?: ApplicationPrincipal) {
    const config = (await this.mcp.config.readServers())[id];
    if (!config) throw new Error("Application connection not found");
    this.metadata(config);
    if (
      principal &&
      !applicationAllowsPersona(
        config,
        principal.personaId,
        principal.delegated,
      )
    )
      throw new Error("This assistant is not allowed to use this application");
    if (principal && config.enabled === false)
      throw new Error("Application is disabled");
    return config;
  }

  private async validatePersonas(ids: string[]) {
    for (const id of ids)
      if (!(await this.personaExists(id)))
        throw new Error(`Assistant not found: ${id}`);
  }

  private oauth(config: McpServerConfig): Record<string, unknown> {
    const value = config.oauth;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? { ...value }
      : {};
  }

  private requireLogin(id: string, loginId: string) {
    if (this.logins.get(loginId) !== id)
      throw new Error("Unknown application login attempt");
  }

  private async cancelFor(id: string) {
    await this.mcp.logins.cancelServer(id);
    for (const [loginId, connectionId] of this.logins)
      if (connectionId === id) {
        this.mcp.logins.cancel(loginId);
        this.logins.delete(loginId);
      }
  }
}
