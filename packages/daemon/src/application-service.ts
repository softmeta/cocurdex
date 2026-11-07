import { randomUUID } from "node:crypto";
import {
  createPiApplicationClient,
  readPiMcpAccessToken,
  savePiMcpAccessToken,
} from "@cocurdex/agent-adapters/pi-mcp";
import {
  type AddApplicationPayload,
  APPLICATION_CATALOG,
  type ApplicationConnection,
  type ApplicationPrincipal,
  applicationAllows,
  type McpLoginOutcome,
  type McpLoginStartResult,
  type McpServerConfig,
  type McpServerStatus,
  readApplicationMetadata,
  type UpdateApplicationPayload,
  withApplicationMetadata,
} from "@cocurdex/shared";
import {
  createGitHubLoginClient,
  type GitHubLoginClient,
} from "./github-login";
import type { DaemonMcpService } from "./mcp-service";

type ApplicationClient = ReturnType<typeof createPiApplicationClient>;

function connectionRevision(config: McpServerConfig) {
  const { cocurdex: _metadata, enabled, ...connection } = config;
  return JSON.stringify({ ...connection, enabled: enabled !== false });
}

interface DeviceLogin {
  connectionId: string;
  controller: AbortController;
  done: Promise<void>;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export class ApplicationService {
  private readonly statuses = new Map<
    string,
    { revision: string; status: McpServerStatus }
  >();
  private readonly logins = new Map<string, string>();
  private readonly deviceLogins = new Map<string, DeviceLogin>();
  private readonly clients = new Map<string, Set<ApplicationClient>>();

  constructor(
    private readonly mcp: DaemonMcpService,
    private readonly personaExists: (id: string) => Promise<boolean>,
    private readonly clientFactory = createPiApplicationClient,
    private readonly announceChanged: () => void = () => {},
    private readonly github: GitHubLoginClient = createGitHubLoginClient(),
  ) {}

  async list(
    principal?: ApplicationPrincipal,
  ): Promise<ApplicationConnection[]> {
    const servers = await this.mcp.config.readServers();
    return Object.entries(servers).flatMap(([id, config]) => {
      const metadata = readApplicationMetadata(config);
      if (!metadata || (principal && !applicationAllows(config, principal)))
        return [];
      const checked = this.statuses.get(id);
      return [
        {
          id,
          ...metadata,
          enabled: config.enabled !== false,
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
          allPersonas: payload.allPersonas ?? true,
          personaIds: [...new Set(payload.personaIds)],
          allowDelegatedWork: payload.allowDelegatedWork ?? true,
          allowWorkSessions: payload.allowWorkSessions ?? true,
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
    await this.mcp.config.updateServer(payload.id, (config) => {
      const metadata = this.metadata(config);
      if (metadata.revision !== payload.revision)
        throw new Error("Application changed. Reload before saving.");
      return withApplicationMetadata(
        { ...config, enabled: payload.enabled },
        {
          ...metadata,
          displayName: payload.displayName.trim() || metadata.displayName,
          allPersonas: payload.allPersonas ?? metadata.allPersonas,
          personaIds: [...new Set(payload.personaIds)],
          allowDelegatedWork: payload.allowDelegatedWork,
          allowWorkSessions:
            payload.allowWorkSessions ?? metadata.allowWorkSessions,
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
    const status = await this.mcp.test(id, config);
    this.statuses.set(id, { revision: connectionRevision(config), status });
    this.announceChanged();
    return this.connection(id);
  }

  async startLogin(id: string): Promise<McpLoginStartResult> {
    const config = await this.require(id);
    this.assertEnabled(config);
    await this.cancelFor(id);
    if (this.metadata(config).applicationId === "github")
      return this.startGitHubLogin(id, config);
    const result = await this.mcp.startLogin(id, undefined, config);
    if (result.loginId) this.logins.set(result.loginId, id);
    return result;
  }

  async waitLogin(id: string, loginId: string): Promise<McpLoginOutcome> {
    this.requireLogin(id, loginId);
    try {
      const device = this.deviceLogins.get(loginId);
      if (!device) return await this.mcp.logins.wait(loginId);
      return await device.done.then(
        () => ({ success: true, error: null }),
        (error: unknown) => ({ success: false, error: errorMessage(error) }),
      );
    } finally {
      this.deviceLogins.delete(loginId);
      this.logins.delete(loginId);
      this.statuses.delete(id);
      this.announceChanged();
    }
  }

  submitRedirect(id: string, loginId: string, url: string) {
    this.requireLogin(id, loginId);
    if (this.deviceLogins.has(loginId))
      throw new Error("GitHub authorization finishes in the browser");
    this.mcp.logins.submitRedirectUrl(loginId, url);
  }

  cancelLogin(id: string, loginId: string) {
    this.requireLogin(id, loginId);
    this.deviceLogins.get(loginId)?.controller.abort();
    this.deviceLogins.delete(loginId);
    this.mcp.logins.cancel(loginId);
    this.logins.delete(loginId);
  }

  private async startGitHubLogin(
    id: string,
    config: McpServerConfig,
  ): Promise<McpLoginStartResult> {
    const location = await this.mcp.location();
    const cliToken = await this.github.cliToken();
    if (cliToken && !(await this.githubTokenInUse(cliToken, id))) {
      await savePiMcpAccessToken(
        location,
        id,
        { accessToken: cliToken },
        config,
      );
      this.statuses.delete(id);
      this.announceChanged();
      return { loginId: null, authUrl: null };
    }
    const controller = new AbortController();
    const code = await this.github.deviceCode(controller.signal);
    const loginId = randomUUID();
    const done = this.github
      .pollToken(code, controller.signal)
      .then(async (token) =>
        savePiMcpAccessToken(location, id, token, await this.require(id)),
      );
    done.catch(() => undefined);
    this.deviceLogins.set(loginId, { connectionId: id, controller, done });
    return {
      loginId,
      authUrl: code.verificationUri,
      userCode: code.userCode,
    };
  }

  private async githubTokenInUse(token: string, exceptId: string) {
    const location = await this.mcp.location();
    const servers = await this.mcp.config.readServers();
    return Object.entries(servers).some(
      ([id, config]) =>
        id !== exceptId &&
        readApplicationMetadata(config)?.applicationId === "github" &&
        readPiMcpAccessToken(location, id) === token,
    );
  }

  async tools(requestedId: string, principal?: ApplicationPrincipal) {
    const id = await this.resolveId(requestedId, principal);
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
    requestedId: string,
    tool: string,
    args: Record<string, unknown>,
    principal: ApplicationPrincipal | undefined,
    readOnly: boolean,
  ) {
    const id = await this.resolveId(requestedId, principal);
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
    for (const device of this.deviceLogins.values()) device.controller.abort();
    this.deviceLogins.clear();
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

  private async resolveId(requested: string, principal?: ApplicationPrincipal) {
    const servers = await this.mcp.config.readServers();
    if (servers[requested] || !principal) return requested;
    const matches = Object.entries(servers).flatMap(([id, config]) =>
      readApplicationMetadata(config)?.applicationId === requested &&
      applicationAllows(config, principal)
        ? [id]
        : [],
    );
    const [only, ...others] = matches;
    if (only && others.length === 0) return only;
    if (only)
      throw new Error(
        `Several ${requested} connections are available. Pass one of these connection ids: ${matches.join(", ")}`,
      );
    throw new Error(
      "Application connection not found. Pass the id field from applications_list.",
    );
  }

  private async require(id: string, principal?: ApplicationPrincipal) {
    const config = (await this.mcp.config.readServers())[id];
    if (!config) throw new Error("Application connection not found");
    this.metadata(config);
    if (principal && !applicationAllows(config, principal))
      throw new Error("This session is not allowed to use this application");
    if (principal && config.enabled === false)
      throw new Error("Application is disabled");
    return config;
  }

  private async validatePersonas(ids: string[]) {
    for (const id of ids)
      if (!(await this.personaExists(id)))
        throw new Error(`Assistant not found: ${id}`);
  }

  private requireLogin(id: string, loginId: string) {
    const owner =
      this.deviceLogins.get(loginId)?.connectionId ?? this.logins.get(loginId);
    if (owner !== id) throw new Error("Unknown application login attempt");
  }

  private async cancelFor(id: string) {
    for (const [loginId, device] of this.deviceLogins)
      if (device.connectionId === id) {
        device.controller.abort();
        this.deviceLogins.delete(loginId);
      }
    await this.mcp.logins.cancelServer(id);
    for (const [loginId, connectionId] of this.logins)
      if (connectionId === id) {
        this.mcp.logins.cancel(loginId);
        this.logins.delete(loginId);
      }
  }
}
