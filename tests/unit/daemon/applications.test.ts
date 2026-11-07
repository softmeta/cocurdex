import { readPiMcpAccessToken } from "@cocurdex/agent-adapters/pi-mcp";
import { ApplicationService } from "@cocurdex/daemon/internal/application-service";
import { DaemonMcpService } from "@cocurdex/daemon/internal/mcp-service";
import { routineRunPolicy } from "@cocurdex/daemon/internal/routines/routine-run-policy";
import type { ApplicationConnection } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it, vi } from "vitest";

const dirs = createTempDirs();
afterAll(() => dirs.cleanup());

function edit(connection: ApplicationConnection) {
  return connection;
}

function githubLogin(cliToken: string | null) {
  return {
    cliToken: vi.fn(async () => cliToken),
    deviceCode: vi.fn(async () => ({
      deviceCode: "synthetic-device",
      userCode: "ABCD-1234",
      verificationUri: "https://github.com/login/device",
      intervalSeconds: 5,
      expiresInSeconds: 900,
    })),
    pollToken: vi.fn(
      async (
        _code: unknown,
        _signal: AbortSignal,
      ): Promise<{ accessToken: string }> => ({
        accessToken: "synthetic-device-token",
      }),
    ),
  };
}

async function setup(github = githubLogin(null)) {
  const mcp = new DaemonMcpService(
    await dirs.create("apps-"),
    async () => null,
  );
  dirs.onCleanup(() => mcp.dispose());
  const client = {
    tools: vi.fn(async () => [
      {
        name: "search",
        description: "Search",
        inputSchema: { type: "object" },
        readOnly: true,
      },
    ]),
    call: vi.fn(async () => ({ content: [{ type: "text", text: "Found" }] })),
    close: vi.fn(async () => {}),
  };
  const factory = vi.fn(() => client);
  const apps = new ApplicationService(
    mcp,
    async (id) => ["a", "b"].includes(id),
    factory,
    undefined,
    github,
  );
  const added = await apps.add({
    applicationId: "notion",
    displayName: "Notes",
    allPersonas: false,
    personaIds: ["a"],
    allowDelegatedWork: false,
  });
  return { mcp, apps, added, client, factory };
}

describe("application connections", () => {
  it("lets read-and-draft routines discover and read applications while blocking general tool calls", () => {
    const allowed = routineRunPolicy("read-and-draft").allowedTools;
    expect(allowed).toContain("applications_list");
    expect(allowed).toContain("applications_tools");
    expect(allowed).toContain("applications_read");
    expect(allowed).not.toContain("applications_call");
    expect(routineRunPolicy("full").allowedTools).toBeNull();
  });
  it("preserves custom MCP servers, supports independent accounts, and excludes managed connections from native injection", async () => {
    const { mcp, apps, added } = await setup();
    await mcp.config.saveServer("custom", {
      command: "custom",
      cocurdex: { agents: ["codex"] },
    });
    const second = await apps.add({
      applicationId: "notion",
      displayName: "Private notes",
      allPersonas: false,
      personaIds: ["b"],
      allowDelegatedWork: false,
    });
    expect(second.id).not.toBe(added.id);
    expect(
      (
        await apps.list({
          personaId: "a",
          delegated: false,
          workSession: false,
        })
      ).map((item) => item.id),
    ).toEqual([added.id]);
    expect(
      (
        await apps.list({
          personaId: "b",
          delegated: false,
          workSession: false,
        })
      ).map((item) => item.id),
    ).toEqual([second.id]);
    expect(added.status).toBeNull();
    await expect(
      mcp.config.setServerAgents(added.id, ["codex", "pi"]),
    ).rejects.toThrow("Applications");
    await mcp.config.updateServer(added.id, (config) => ({
      ...config,
      cocurdex: {
        ...(config.cocurdex as Record<string, unknown>),
        agents: ["codex", "pi"],
      },
    }));
    expect(
      (await mcp.serversForAgent("codex")).map((item) => item.name),
    ).toEqual(["custom"]);
    expect((await mcp.config.readServers()).custom).toMatchObject({
      command: "custom",
    });
  });

  it("checks grants before every discovery and call, including revocation after tool discovery", async () => {
    const { apps, added, client, factory } = await setup();
    await expect(
      apps.tools(added.id, {
        personaId: "b",
        delegated: false,
        workSession: false,
      }),
    ).rejects.toThrow("not allowed");
    await expect(
      apps.call(
        added.id,
        "search",
        {},
        { personaId: "a", delegated: true, workSession: false },
      ),
    ).rejects.toThrow("not allowed");
    expect(factory).not.toHaveBeenCalled();
    expect(
      await apps.call(
        added.id,
        "search",
        {},
        { personaId: "a", delegated: false, workSession: false },
      ),
    ).toMatchObject({ content: [{ text: "Found" }] });
    expect(client.close).toHaveBeenCalledTimes(1);
    client.tools.mockImplementationOnce(async () => {
      await apps.update({ ...edit(added), personaIds: [], enabled: true });
      return [
        {
          name: "search",
          description: "Search",
          inputSchema: { type: "object" },
          readOnly: true,
        },
      ];
    });
    await expect(
      apps.call(
        added.id,
        "search",
        {},
        { personaId: "a", delegated: false, workSession: false },
      ),
    ).rejects.toThrow("not allowed");
    expect(client.call).toHaveBeenCalledTimes(1);
    expect(client.close).toHaveBeenCalledTimes(2);
  });

  it("opens a new connection to every assistant and their delegated work, including assistants created later, until narrowed", async () => {
    const { mcp, apps } = await setup();
    const open = await apps.add({
      applicationId: "linear",
      displayName: "Issues",
      personaIds: [],
    });
    expect(open.allPersonas).toBe(true);
    expect(open.allowDelegatedWork).toBe(true);
    const later = {
      personaId: "created-later",
      delegated: false,
      workSession: false,
    };
    expect((await apps.list(later)).map((item) => item.id)).toEqual([open.id]);
    expect(
      (await apps.list({ ...later, delegated: true })).map((item) => item.id),
    ).toEqual([open.id]);
    const narrowed = await apps.update({
      ...edit(open),
      allPersonas: false,
      personaIds: ["a"],
    });
    expect(await apps.list(later)).toEqual([]);
    const kept = await apps.update({
      ...edit(narrowed),
      displayName: "Tracker",
    });
    expect(kept.allPersonas).toBe(false);
    await mcp.config.updateServer(open.id, (config) => {
      const extension = config.cocurdex as {
        application: Record<string, unknown>;
      };
      const { allPersonas: _dropped, ...legacy } = extension.application;
      return { ...config, cocurdex: { ...extension, application: legacy } };
    });
    const [legacy] = (await apps.list()).filter((item) => item.id === open.id);
    expect(legacy).toMatchObject({ allPersonas: false, personaIds: ["a"] });
  });

  it("accepts an application id when exactly one granted connection matches it", async () => {
    const { apps, added, factory } = await setup();
    const a = { personaId: "a", delegated: false, workSession: false };
    const b = { personaId: "b", delegated: false, workSession: false };
    expect(await apps.read("notion", "search", {}, a)).toMatchObject({
      content: [{ text: "Found" }],
    });
    expect(factory).toHaveBeenLastCalledWith(
      expect.anything(),
      added.id,
      expect.anything(),
    );
    await expect(apps.tools("notion", b)).rejects.toThrow(
      "Application connection not found",
    );
    const second = await apps.add({
      applicationId: "notion",
      displayName: "Team notes",
      allPersonas: false,
      personaIds: ["a"],
      allowDelegatedWork: false,
    });
    const ambiguous = apps.tools("notion", a);
    await expect(ambiguous).rejects.toThrow(added.id);
    await expect(apps.tools("notion", a)).rejects.toThrow(second.id);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("lets work sessions use a connection only while it is open to them", async () => {
    const { apps, added } = await setup();
    const work = { personaId: null, delegated: false, workSession: true };
    expect(added.allowWorkSessions).toBe(true);
    expect((await apps.list(work)).map((item) => item.id)).toEqual([added.id]);
    expect(await apps.call(added.id, "search", {}, work)).toMatchObject({
      content: [{ text: "Found" }],
    });
    const closed = await apps.update({
      ...edit(added),
      allowWorkSessions: false,
    });
    expect(await apps.list(work)).toEqual([]);
    await expect(apps.read(added.id, "search", {}, work)).rejects.toThrow(
      "not allowed",
    );
    const reopened = await apps.update({ ...edit(closed), enabled: true });
    expect(reopened.allowWorkSessions).toBe(false);
    await expect(
      apps.list({ personaId: null, delegated: false, workSession: false }),
    ).resolves.toEqual([]);
  });

  it("allows read-only tool calls but refuses tools without an explicit read-only declaration", async () => {
    const { apps, added, client } = await setup();
    await expect(
      apps.read(
        added.id,
        "search",
        {},
        { personaId: "a", delegated: false, workSession: false },
      ),
    ).resolves.toMatchObject({ content: [{ text: "Found" }] });
    client.tools.mockResolvedValueOnce([
      {
        name: "search",
        description: "Search",
        inputSchema: { type: "object" },
        readOnly: false,
      },
    ]);
    await expect(
      apps.read(
        added.id,
        "search",
        {},
        { personaId: "a", delegated: false, workSession: false },
      ),
    ).rejects.toThrow("read-only");
    expect(client.call).toHaveBeenCalledTimes(1);
  });

  it("closes active discovery before sign-out and refuses disabled connections for human calls too", async () => {
    const { apps, added, client } = await setup();
    client.tools.mockImplementationOnce(async () => {
      await apps.logout(added.id);
      return [
        {
          name: "search",
          description: "Search",
          inputSchema: { type: "object" },
          readOnly: true,
        },
      ];
    });
    await expect(apps.call(added.id, "search", {})).rejects.toThrow("closed");
    expect(client.call).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalledTimes(1);
    await apps.update({ ...edit(added), enabled: false });
    await expect(apps.call(added.id, "search", {})).rejects.toThrow("disabled");
    await expect(apps.tools(added.id)).rejects.toThrow("disabled");
    await expect(apps.startLogin(added.id)).rejects.toThrow("disabled");
  });

  it("never retries a tool failure and always closes the client", async () => {
    const { apps, added, client } = await setup();
    client.call.mockRejectedValueOnce(new Error("Connection lost after write"));
    await expect(apps.call(added.id, "search", {})).rejects.toThrow(
      "after write",
    );
    expect(client.call).toHaveBeenCalledTimes(1);
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it("rejects stale grant updates and unknown assistants without losing the saved grant", async () => {
    const { apps, added } = await setup();
    const updated = await apps.update({
      ...edit(added),
      enabled: true,
      allowDelegatedWork: true,
    });
    await expect(
      apps.update({ ...edit(added), enabled: true, personaIds: [] }),
    ).rejects.toThrow("Reload");
    await expect(
      apps.update({ ...edit(updated), enabled: true, personaIds: ["missing"] }),
    ).rejects.toThrow("Assistant not found");
    expect((await apps.list())[0]).toMatchObject({
      personaIds: ["a"],
      allowDelegatedWork: true,
    });
    await apps.update({ ...edit(updated), enabled: false });
    expect(
      await apps.list({ personaId: "a", delegated: true, workSession: false }),
    ).toEqual([]);
  });

  it("drops a deleted assistant from the grant instead of refusing later edits", async () => {
    const { mcp } = await setup();
    const personas = new Set(["a", "b"]);
    const apps = new ApplicationService(mcp, async (id) => personas.has(id));
    const added = await apps.add({
      applicationId: "github",
      displayName: "GitHub",
      allPersonas: false,
      personaIds: ["a", "b"],
      allowDelegatedWork: false,
    });
    personas.delete("b");

    const listed = (await apps.list()).find((item) => item.id === added.id);
    expect(listed?.personaIds).toEqual(["a"]);

    const updated = await apps.update({
      ...edit(added),
      enabled: true,
      allowWorkSessions: false,
    });
    expect(updated).toMatchObject({
      personaIds: ["a"],
      allowWorkSessions: false,
    });
    await expect(
      apps.update({ ...edit(updated), enabled: true, personaIds: ["a", "c"] }),
    ).rejects.toThrow("Assistant not found: c");
  });

  it("keeps a checked status across grant edits and drops it when the connection itself changes", async () => {
    const { mcp, apps, added } = await setup();
    vi.spyOn(mcp, "test").mockResolvedValue({
      name: added.id,
      scope: "global",
      state: "connected",
      tools: [],
      error: null,
      oauth: true,
      signedIn: true,
      checkedAt: new Date(0).toISOString(),
    });
    const checked = await apps.check(added.id);
    expect(checked.status?.state).toBe("connected");
    const granted = await apps.update({
      ...edit(checked),
      personaIds: ["a", "b"],
      allowDelegatedWork: true,
      displayName: "Team notes",
    });
    expect(granted.status?.state).toBe("connected");
    const disabled = await apps.update({ ...edit(granted), enabled: false });
    expect(disabled.status).toBeNull();
  });
  it("signs GitHub in with the gh token once, then uses device authorization for another account", async () => {
    const github = githubLogin("synthetic-gh-token");
    const { apps, mcp, added } = await setup(github);
    const first = await apps.add({
      applicationId: "github",
      displayName: "Code",
      personaIds: [],
      allowDelegatedWork: false,
    });
    expect(await apps.startLogin(first.id)).toEqual({
      loginId: null,
      authUrl: null,
    });
    const location = await mcp.location();
    expect(readPiMcpAccessToken(location, first.id)).toBe("synthetic-gh-token");
    const second = await apps.add({
      applicationId: "github",
      displayName: "Work code",
      personaIds: [],
      allowDelegatedWork: false,
    });
    const started = await apps.startLogin(second.id);
    expect(started).toMatchObject({
      authUrl: "https://github.com/login/device",
      userCode: "ABCD-1234",
    });
    expect(await apps.waitLogin(second.id, started.loginId ?? "")).toEqual({
      success: true,
      error: null,
    });
    expect(readPiMcpAccessToken(location, second.id)).toBe(
      "synthetic-device-token",
    );
    await apps.remove(second.id);
    expect((await apps.list()).map((item) => item.id)).toEqual([
      added.id,
      first.id,
    ]);
  });

  it("cancels a pending GitHub device authorization", async () => {
    const github = githubLogin(null);
    github.pollToken.mockImplementation(
      (_code, signal) =>
        new Promise<{ accessToken: string }>((_resolve, reject) =>
          signal.addEventListener("abort", () =>
            reject(new Error("GitHub authorization was cancelled")),
          ),
        ),
    );
    const { apps, mcp } = await setup(github);
    const connection = await apps.add({
      applicationId: "github",
      displayName: "Code",
      personaIds: [],
      allowDelegatedWork: false,
    });
    const started = await apps.startLogin(connection.id);
    const waiting = apps.waitLogin(connection.id, started.loginId ?? "");
    apps.cancelLogin(connection.id, started.loginId ?? "");
    expect(await waiting).toEqual({
      success: false,
      error: "GitHub authorization was cancelled",
    });
    expect(
      readPiMcpAccessToken(await mcp.location(), connection.id),
    ).toBeNull();
  });

  it("fails closed if advanced settings replace a catalog endpoint or managed metadata", async () => {
    const { apps, mcp, added, factory } = await setup();
    await mcp.config.updateServer(added.id, (config) => ({
      ...config,
      url: "https://example.invalid/mcp",
    }));
    await expect(apps.tools(added.id)).rejects.toThrow("endpoint was changed");
    expect(factory).not.toHaveBeenCalled();
    await mcp.config.updateServer(added.id, (config) => ({
      ...config,
      cocurdex: { application: null, agents: ["codex"] },
    }));
    expect(await apps.list()).toEqual([]);
    expect(await mcp.serversForAgent("codex")).toEqual([]);
  });
});
