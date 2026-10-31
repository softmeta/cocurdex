import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { handleDaemonRequest } from "@cocurdex/daemon/internal/handler";
import { CocurdexDaemonService } from "@cocurdex/daemon/internal/service";
import type {
  DaemonMethod,
  DaemonRequest,
  DaemonRequestPayloadByMethod,
} from "@cocurdex/rpc";
import type { HostPrincipal } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";
import { skillMarkdown } from "./skill-test-repo";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

const now = "2026-10-20T00:00:00.000Z";
const device: HostPrincipal = {
  kind: "device",
  deviceId: "phone-1",
  scopes: ["read", "files.read", "host.admin"],
};

function skillFolder(root: string) {
  mkdirSync(path.join(root, "deploy"), { recursive: true });
  writeFileSync(
    path.join(root, "deploy", "SKILL.md"),
    skillMarkdown("deploy", "Ship it"),
  );
  return root;
}

async function setup() {
  const userDataPath = tempDirs.createSync("skill-access-");
  const workspace = skillFolder(tempDirs.createSync("skill-access-ws-"));
  const outside = skillFolder(tempDirs.createSync("skill-access-out-"));
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "skill-access-test",
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
  return { call, workspace, outside, userDataPath };
}

describe("skill source path access", () => {
  it("confines remote devices to folders inside registered workspaces", async () => {
    const { call, workspace, outside, userDataPath } = await setup();

    await expect(
      call("skills.source.inspect", { source: outside }, device),
    ).rejects.toThrow(/outside every registered workspace/);
    await expect(
      call(
        "skills.add",
        {
          scope: "workspace",
          workspaceId: "workspace-1",
          source: outside,
          skillPaths: ["deploy"],
          agents: [],
          replace: [],
        },
        device,
      ),
    ).rejects.toThrow(/outside every registered workspace/);
    expect(existsSync(path.join(workspace, ".agents"))).toBe(false);
    expect(existsSync(path.join(workspace, "skills-lock.json"))).toBe(false);
    expect(existsSync(path.join(userDataPath, "skill-backups"))).toBe(false);

    const inside = await call(
      "skills.source.inspect",
      { source: workspace },
      device,
    );
    expect(inside.skills.map((skill) => skill.name)).toEqual(["deploy"]);
  });
});
