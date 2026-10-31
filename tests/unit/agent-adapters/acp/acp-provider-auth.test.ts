import type {
  AcpConnection,
  AcpConnectionFactory,
} from "@cocurdex/agent-adapters/internal/acp/acp-connection";
import {
  listAcpProviderModels,
  resetAcpProviderModelsCache,
} from "@cocurdex/agent-adapters/internal/acp/acp-model-catalog";
import {
  cancelAcpProviderLogin,
  loginAcpProvider,
  logoutAcpProvider,
  readAcpProviderAuth,
} from "@cocurdex/agent-adapters/internal/acp/acp-provider-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spec = {
  command: "agy",
  args: ["acp"],
  providerId: "acp:antigravity",
  providerName: "Antigravity",
  authMethodPriority: ["oauth-personal"],
};

const authMethods = [
  { id: "oauth-personal", name: "Log in with Google" },
  {
    id: "gemini-api-key",
    name: "Use Gemini API key",
    description: "Reads GEMINI_API_KEY",
  },
];

function createFactory(
  overrides: Partial<AcpConnection> = {},
  initialize: Record<string, unknown> = {},
) {
  const close = vi.fn(async () => undefined);
  const connection = {
    initialize: vi.fn(async () => ({
      protocolVersion: 1,
      authMethods,
      agentCapabilities: { auth: { logout: {} } },
      ...initialize,
    })),
    authenticate: vi.fn(async () => ({})),
    logout: vi.fn(async () => ({})),
    newSession: vi.fn(async () => ({ sessionId: "probe-session" })),
    close,
    ...overrides,
  } as unknown as AcpConnection;

  return {
    close,
    connection,
    factory: vi.fn(async () => connection) as unknown as AcpConnectionFactory,
  };
}

function pendingAuthenticate() {
  let resolve: (() => void) | undefined;
  const authenticate = vi.fn(
    () =>
      new Promise<Record<string, never>>((done) => {
        resolve = () => done({});
      }),
  );
  return { authenticate, resolve: () => resolve?.() };
}

beforeEach(() => {
  resetAcpProviderModelsCache();
});

describe("readAcpProviderAuth", () => {
  it("reports advertised methods, the default method, and logout support", async () => {
    const { factory, connection, close } = createFactory();

    await expect(readAcpProviderAuth(spec, factory)).resolves.toEqual({
      methods: [
        {
          id: "oauth-personal",
          name: "Log in with Google",
          description: null,
        },
        {
          id: "gemini-api-key",
          name: "Use Gemini API key",
          description: "Reads GEMINI_API_KEY",
        },
      ],
      loginMethodId: "oauth-personal",
      logoutSupported: true,
    });
    expect(connection.authenticate).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("reports no logout support when the capability is missing", async () => {
    const { factory } = createFactory({}, { agentCapabilities: {} });

    await expect(readAcpProviderAuth(spec, factory)).resolves.toMatchObject({
      logoutSupported: false,
    });
  });
});

describe("loginAcpProvider", () => {
  it("authenticates with the prioritized advertised method", async () => {
    const { factory, connection, close } = createFactory();

    await loginAcpProvider(spec, factory);

    expect(connection.authenticate).toHaveBeenCalledWith({
      methodId: "oauth-personal",
    });
    expect(connection.newSession).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("authenticates with an explicitly chosen method", async () => {
    const { factory, connection } = createFactory();

    await loginAcpProvider(spec, factory, { methodId: "gemini-api-key" });

    expect(connection.authenticate).toHaveBeenCalledWith({
      methodId: "gemini-api-key",
    });
  });

  it("rejects a method the agent does not advertise", async () => {
    const { factory, connection } = createFactory();

    await expect(
      loginAcpProvider(spec, factory, { methodId: "made-up" }),
    ).rejects.toThrow("does not offer the login method made-up");
    expect(connection.authenticate).not.toHaveBeenCalled();
  });

  it("falls back to the first advertised method", async () => {
    const { factory, connection } = createFactory(
      {},
      { authMethods: [{ id: "other_method", name: "Other" }] },
    );

    await loginAcpProvider(spec, factory);

    expect(connection.authenticate).toHaveBeenCalledWith({
      methodId: "other_method",
    });
  });

  it("skips authenticate when the agent advertises no auth methods", async () => {
    const { factory, connection } = createFactory({}, { authMethods: [] });

    await loginAcpProvider(spec, factory);

    expect(connection.authenticate).not.toHaveBeenCalled();
  });

  it("re-probes the catalog after a successful login", async () => {
    const { factory } = createFactory();

    await listAcpProviderModels(spec, factory);
    await loginAcpProvider(spec, factory);
    await listAcpProviderModels(spec, factory);

    expect(factory).toHaveBeenCalledTimes(3);
  });

  it("shares a single in-flight login for the same method", async () => {
    const pending = pendingAuthenticate();
    const { factory, connection } = createFactory({
      authenticate: pending.authenticate,
    });

    const first = loginAcpProvider(spec, factory);
    const second = loginAcpProvider(spec, factory);
    await vi.waitFor(() =>
      expect(connection.authenticate).toHaveBeenCalledOnce(),
    );

    expect(factory).toHaveBeenCalledOnce();
    pending.resolve();
    await Promise.all([first, second]);
  });

  it("refuses a different method while another login is in flight", async () => {
    const pending = pendingAuthenticate();
    const { factory, connection } = createFactory({
      authenticate: pending.authenticate,
    });

    const first = loginAcpProvider(spec, factory);
    await vi.waitFor(() =>
      expect(connection.authenticate).toHaveBeenCalledOnce(),
    );

    await expect(
      loginAcpProvider(spec, factory, { methodId: "gemini-api-key" }),
    ).rejects.toThrow("already signing in");
    pending.resolve();
    await first;
  });

  it("stops waiting and closes the agent when the login is cancelled", async () => {
    const pending = pendingAuthenticate();
    const { factory, connection, close } = createFactory({
      authenticate: pending.authenticate,
    });

    const login = loginAcpProvider(spec, factory);
    await vi.waitFor(() =>
      expect(connection.authenticate).toHaveBeenCalledOnce(),
    );

    expect(cancelAcpProviderLogin(spec)).toBe(true);
    await expect(login).rejects.toThrow("login was cancelled");
    expect(close).toHaveBeenCalledOnce();
    expect(cancelAcpProviderLogin(spec)).toBe(false);
  });

  it("rejects when the agent never finishes authenticating", async () => {
    const { factory } = createFactory({
      authenticate: vi.fn(() => new Promise<never>(() => {})),
    });

    await expect(
      loginAcpProvider(spec, factory, { timeoutMs: 5 }),
    ).rejects.toThrow("login timed out");
  });
});

describe("logoutAcpProvider", () => {
  it("logs out and re-probes the catalog afterwards", async () => {
    const { factory, connection } = createFactory();

    await listAcpProviderModels(spec, factory);
    await logoutAcpProvider(spec, factory);
    await listAcpProviderModels(spec, factory);

    expect(connection.logout).toHaveBeenCalledWith({});
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it("refuses when the agent does not support logging out", async () => {
    const { factory, connection } = createFactory(
      {},
      { agentCapabilities: {} },
    );

    await expect(logoutAcpProvider(spec, factory)).rejects.toThrow(
      "does not support logging out",
    );
    expect(connection.logout).not.toHaveBeenCalled();
  });
});
