import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AcpConnection, AcpConnectionFactory } from "./acp-connection";
import {
  listAcpProviderModels,
  loginAcpProvider,
  resetAcpProviderModelsCache,
} from "./acp-model-catalog";

const composer = {
  modelId: "composer-2.5",
  name: "Composer 2.5",
  _meta: { totalContextTokens: 200_000 },
};

const sonnet = {
  modelId: "claude-4-sonnet",
  name: "Claude 4 Sonnet",
};

const spec = {
  command: "cursor-agent",
  args: ["acp"],
  providerId: "cursor",
  providerName: "Cursor",
};

function createFactory(overrides: Partial<AcpConnection> = {}) {
  const close = vi.fn(async () => undefined);
  const connection = {
    initialize: vi.fn(async () => ({
      protocolVersion: 1,
      authMethods: [{ id: "cursor_login", name: "Cursor Login" }],
      _meta: {
        modelState: {
          currentModelId: composer.modelId,
          availableModels: [composer, sonnet],
        },
      },
    })),
    authenticate: vi.fn(async () => ({})),
    newSession: vi.fn(async () => ({
      sessionId: "probe-session",
      models: {
        currentModelId: sonnet.modelId,
        availableModels: [sonnet],
      },
    })),
    close,
    ...overrides,
  } as unknown as AcpConnection;

  return {
    close,
    connection,
    factory: vi.fn(async () => connection) as unknown as AcpConnectionFactory,
  };
}

describe("listAcpProviderModels", () => {
  beforeEach(() => {
    resetAcpProviderModelsCache();
  });

  it("builds the catalog from initialize model state without authenticating", async () => {
    const { factory, connection, close } = createFactory();

    const items = await listAcpProviderModels(spec, factory);

    expect(connection.authenticate).not.toHaveBeenCalled();
    expect(connection.newSession).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    expect(items.map(({ model }) => model.modelId)).toEqual([
      "composer-2.5",
      "claude-4-sonnet",
    ]);
    expect(items[0]?.model).toMatchObject({
      name: "Composer 2.5",
      isDefault: true,
      contextLimit: 200_000,
    });
    expect(items[0]?.provider.id).toBe("cursor");
  });

  it("falls back to session/new when initialize has no models", async () => {
    const { factory, connection } = createFactory({
      initialize: vi.fn(async () => ({
        protocolVersion: 1,
        authMethods: [{ id: "cursor_login", name: "Cursor Login" }],
      })),
    });

    const items = await listAcpProviderModels(spec, factory);

    expect(connection.newSession).toHaveBeenCalled();
    expect(items).toHaveLength(1);
    expect(items[0]?.model.modelId).toBe("claude-4-sonnet");
    expect(items[0]?.model.isDefault).toBe(true);
  });

  it("reads Devin-style model config options from session/new", async () => {
    const { factory, connection } = createFactory({
      initialize: vi.fn(async () => ({
        protocolVersion: 1,
        authMethods: [{ id: "devin-browser", name: "Log in with browser" }],
      })),
      newSession: vi.fn(async () => ({
        sessionId: "successful-ping",
        configOptions: [
          {
            id: "model",
            name: "Model",
            category: "model",
            type: "select" as const,
            currentValue: "swe-2-high",
            options: [
              { value: "swe-2-high", name: "SWE-2 High" },
              { value: "claude-sonnet-5-high", name: "Claude Sonnet 5 High" },
            ],
          },
        ],
      })),
    });

    const items = await listAcpProviderModels(
      {
        command: "devin",
        args: ["acp"],
        providerId: "devin",
        providerName: "Devin",
      },
      factory,
    );

    expect(connection.authenticate).not.toHaveBeenCalled();
    expect(items.map(({ model }) => model.modelId)).toEqual([
      "swe-2-high",
      "claude-sonnet-5-high",
    ]);
    expect(items[0]?.model).toMatchObject({
      name: "SWE-2 High",
      isDefault: true,
    });
  });

  it("returns an empty catalog when the probe fails", async () => {
    const { factory } = createFactory({
      initialize: vi.fn(async () => {
        throw new Error("not authenticated");
      }),
    });

    await expect(listAcpProviderModels(spec, factory)).resolves.toEqual([]);
  });

  it("probes once and reuses the resolved catalog", async () => {
    const { factory } = createFactory();

    await listAcpProviderModels(spec, factory);
    await listAcpProviderModels(spec, factory);

    expect(factory).toHaveBeenCalledOnce();
  });
});

describe("loginAcpProvider", () => {
  const loginSpec = { ...spec, authMethodPriority: ["cursor_login"] };

  beforeEach(() => {
    resetAcpProviderModelsCache();
  });

  it("authenticates with the prioritized advertised method", async () => {
    const { factory, connection, close } = createFactory();

    await loginAcpProvider(loginSpec, factory);

    expect(connection.authenticate).toHaveBeenCalledWith({
      methodId: "cursor_login",
    });
    expect(connection.newSession).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("falls back to the first advertised method", async () => {
    const { factory, connection } = createFactory({
      initialize: vi.fn(async () => ({
        protocolVersion: 1,
        authMethods: [{ id: "other_method", name: "Other" }],
      })),
    });

    await loginAcpProvider(loginSpec, factory);

    expect(connection.authenticate).toHaveBeenCalledWith({
      methodId: "other_method",
    });
  });

  it("skips authenticate when the agent advertises no auth methods", async () => {
    const { factory, connection } = createFactory({
      initialize: vi.fn(async () => ({
        protocolVersion: 1,
        authMethods: [],
      })),
    });

    await loginAcpProvider(loginSpec, factory);

    expect(connection.authenticate).not.toHaveBeenCalled();
  });

  it("re-probes the catalog after a successful login", async () => {
    const { factory } = createFactory();

    await listAcpProviderModels(spec, factory);
    await loginAcpProvider(loginSpec, factory);
    await listAcpProviderModels(spec, factory);

    expect(factory).toHaveBeenCalledTimes(3);
  });

  it("shares a single in-flight login", async () => {
    let resolveAuth: (() => void) | undefined;
    const { factory, connection } = createFactory({
      authenticate: vi.fn(
        () =>
          new Promise<Record<string, never>>((resolve) => {
            resolveAuth = () => resolve({});
          }),
      ),
    });

    const first = loginAcpProvider(loginSpec, factory);
    const second = loginAcpProvider(loginSpec, factory);
    await vi.waitFor(() =>
      expect(connection.authenticate).toHaveBeenCalledOnce(),
    );

    expect(factory).toHaveBeenCalledOnce();
    resolveAuth?.();
    await Promise.all([first, second]);
  });

  it("rejects when the agent never finishes authenticating", async () => {
    const { factory } = createFactory({
      authenticate: vi.fn(() => new Promise<never>(() => {})),
    });

    await expect(
      loginAcpProvider(loginSpec, factory, { timeoutMs: 5 }),
    ).rejects.toThrow("login timed out");
  });
});
