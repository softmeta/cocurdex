import { ApplicationService } from "@cocurdex/daemon/internal/application-service";
import { DaemonMcpService } from "@cocurdex/daemon/internal/mcp-service";
import { routineRunPolicy } from "@cocurdex/daemon/internal/routines/routine-run-policy";
import type { ApplicationConnection } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it, vi } from "vitest";

const dirs = createTempDirs();
afterAll(() => dirs.cleanup());

function edit({
  clientId: _client,
  callbackPort: _port,
  ...connection
}: ApplicationConnection) {
  return connection;
}

async function setup() {
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
  );
  const added = await apps.add({
    applicationId: "notion",
    displayName: "Notes",
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
      personaIds: ["b"],
      allowDelegatedWork: false,
    });
    expect(second.id).not.toBe(added.id);
    expect(
      (await apps.list({ personaId: "a", delegated: false })).map(
        (item) => item.id,
      ),
    ).toEqual([added.id]);
    expect(
      (await apps.list({ personaId: "b", delegated: false })).map(
        (item) => item.id,
      ),
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
      apps.tools(added.id, { personaId: "b", delegated: false }),
    ).rejects.toThrow("not allowed");
    await expect(
      apps.call(added.id, "search", {}, { personaId: "a", delegated: true }),
    ).rejects.toThrow("not allowed");
    expect(factory).not.toHaveBeenCalled();
    expect(
      await apps.call(
        added.id,
        "search",
        {},
        { personaId: "a", delegated: false },
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
      apps.call(added.id, "search", {}, { personaId: "a", delegated: false }),
    ).rejects.toThrow("not allowed");
    expect(client.call).toHaveBeenCalledTimes(1);
    expect(client.close).toHaveBeenCalledTimes(2);
  });

  it("allows read-only tool calls but refuses tools without an explicit read-only declaration", async () => {
    const { apps, added, client } = await setup();
    await expect(
      apps.read(added.id, "search", {}, { personaId: "a", delegated: false }),
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
      apps.read(added.id, "search", {}, { personaId: "a", delegated: false }),
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
    expect(await apps.list({ personaId: "a", delegated: true })).toEqual([]);
  });

  it("requires GitHub client configuration, keeps secrets private, and removes only the selected connection", async () => {
    const { apps, added } = await setup();
    const github = await apps.add({
      applicationId: "github",
      displayName: "Code",
      personaIds: [],
      allowDelegatedWork: false,
    });
    expect(github.configured).toBe(false);
    await expect(apps.startLogin(github.id)).rejects.toThrow("Configure");
    const configured = await apps.update({
      ...edit(github),
      enabled: true,
      clientId: "synthetic-client",
      clientSecret: "synthetic-secret",
      callbackPort: 19173,
    });
    expect(configured.configured).toBe(true);
    expect(JSON.stringify(await apps.list())).not.toContain("synthetic-secret");
    await apps.remove(github.id);
    expect((await apps.list()).map((item) => item.id)).toEqual([added.id]);
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
