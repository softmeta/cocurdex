import { existsSync } from "node:fs";
import path from "node:path";
import { handleDaemonRequest } from "@cocurdex/daemon/internal/handler";
import { CocurdexDaemonService } from "@cocurdex/daemon/internal/service";
import { authorizeDaemonRequest } from "@cocurdex/daemon/internal/wire-request";
import type {
  DaemonMethod,
  DaemonRequest,
  DaemonRequestPayloadByMethod,
} from "@cocurdex/rpc";
import type { HostPrincipal } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

const now = "2026-10-20T00:00:00.000Z";
const credentialsDevice: HostPrincipal = {
  kind: "device",
  deviceId: "phone-1",
  scopes: ["read", "credentials"],
};
const executeDevice: HostPrincipal = {
  kind: "device",
  deviceId: "phone-2",
  scopes: ["read", "credentials", "execute"],
};

async function setup() {
  const userDataPath = tempDirs.createSync("mcp-access-");
  const workspace = tempDirs.createSync("mcp-access-ws-");
  const outside = tempDirs.createSync("mcp-access-out-");
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "mcp-access-test",
    userDataPath,
  });
  tempDirs.onCleanup(() => service.shutdown());
  await service.saveWorkspace({
    id: "workspace-1",
    name: "acme-shop",
    rootPaths: [workspace],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  });
  const call = <M extends DaemonMethod>(
    method: M,
    params: DaemonRequestPayloadByMethod[M],
    principal: HostPrincipal,
  ) =>
    handleDaemonRequest<M>(
      service,
      { id: "1", method, params, token: "test" } as unknown as DaemonRequest<M>,
      { principal, remoteAddress: "10.0.0.2" },
    );
  return { call, outside };
}

function markerServer(marker: string) {
  return {
    command: process.execPath,
    args: [
      "-e",
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "x")`,
    ],
  };
}

describe("MCP RPC access", () => {
  it("requires the execute scope to start MCP servers", () => {
    for (const method of [
      "mcp.server.test",
      "mcp.status",
      "mcp.login.start",
      "mcp.saveConfig",
      "mcp.server.save",
      "mcp.server.setEnabled",
      "mcp.server.remove",
      "mcp.servers.merge",
    ]) {
      expect(
        authorizeDaemonRequest(credentialsDevice, method, true),
      ).toMatchObject({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(authorizeDaemonRequest(executeDevice, method, true)).toMatchObject(
        {
          ok: true,
        },
      );
    }
  });

  it("refuses remote MCP server starts outside every workspace", async () => {
    const { call, outside } = await setup();
    const marker = path.join(outside, "ran.txt");

    await expect(
      call(
        "mcp.server.test",
        { name: "probe", config: markerServer(marker) },
        executeDevice,
      ),
    ).rejects.toThrow(/registered workspace/);
    await expect(call("mcp.status", {}, executeDevice)).rejects.toThrow(
      /registered workspace/,
    );
    await expect(
      call("mcp.login.start", { name: "probe" }, executeDevice),
    ).rejects.toThrow(/registered workspace/);
    expect(existsSync(marker)).toBe(false);
  });
});
