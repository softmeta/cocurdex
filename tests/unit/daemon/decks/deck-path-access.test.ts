import { copyFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
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

const now = "2026-10-19T00:00:00.000Z";
const swatch = createRequire(import.meta.url).resolve(
  "./fixtures/swatch-3x2.png",
);
const device: HostPrincipal = {
  kind: "device",
  deviceId: "phone-1",
  scopes: ["read", "interact", "files.read", "files.write"],
};

async function setup() {
  const userDataPath = tempDirs.createSync("deck-access-");
  const workspace = tempDirs.createSync("deck-access-ws-");
  const outside = tempDirs.createSync("deck-access-out-");
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "deck-access-test",
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
  copyFileSync(swatch, path.join(workspace, "inside.png"));
  copyFileSync(swatch, path.join(outside, "outside.png"));
  const call = <M extends DaemonMethod>(
    method: M,
    params: DaemonRequestPayloadByMethod[M],
    principal: HostPrincipal = { kind: "local" },
  ) =>
    handleDaemonRequest<M>(
      service,
      { id: "1", method, params, token: "test" } as unknown as DaemonRequest<M>,
      {
        principal,
        remoteAddress: principal.kind === "local" ? null : "10.0.0.2",
      },
    );
  const created = await call("deck.create", { markdown: "# Deck" });
  return { call, workspace, outside, deckId: created.deck.id };
}

describe("deck path RPC access", () => {
  it("confines remote devices to registered workspaces", async () => {
    const { call, workspace, outside, deckId } = await setup();

    await expect(
      call(
        "deck.importImage",
        { path: path.join(outside, "outside.png") },
        device,
      ),
    ).rejects.toThrow(/outside every registered workspace/);
    await expect(
      call(
        "deck.importImage",
        { path: path.join(workspace, "inside.png") },
        device,
      ),
    ).resolves.toMatchObject({ width: 3, height: 2 });

    const escaped = path.join(outside, "export.pdf");
    await expect(
      call(
        "deck.exportFile",
        { id: deckId, outputPath: escaped, format: "pdf" },
        device,
      ),
    ).rejects.toThrow(/outside every registered workspace/);
    expect(existsSync(escaped)).toBe(false);

    const missingParent = path.join(workspace, "new-dir", "export.pdf");
    await expect(
      call(
        "deck.exportFile",
        { id: deckId, outputPath: missingParent, format: "pdf" },
        device,
      ),
    ).rejects.toThrow(/outside every registered workspace/);
  });

  it("needs interact to import and the file scope to touch a path", async () => {
    const { call, workspace, deckId } = await setup();
    const fileReader: HostPrincipal = {
      kind: "device",
      deviceId: "reader-1",
      scopes: ["read", "files.read"],
    };
    for (const method of ["deck.import", "deck.importImage"]) {
      expect(authorizeDaemonRequest(fileReader, method, true)).toMatchObject({
        ok: false,
        code: "FORBIDDEN",
        message: expect.stringContaining("interact"),
      });
    }

    const interactor: HostPrincipal = {
      kind: "device",
      deviceId: "editor-1",
      scopes: ["read", "interact"],
    };
    await expect(
      call(
        "deck.importImage",
        { path: path.join(workspace, "inside.png") },
        interactor,
      ),
    ).rejects.toThrow(/missing the files.read scope/);
    const output = path.join(workspace, "export.pdf");
    await expect(
      call(
        "deck.exportFile",
        { id: deckId, outputPath: output, format: "pdf" },
        { ...interactor, scopes: ["read", "files.read"] },
      ),
    ).rejects.toThrow(/missing the files.write scope/);
    expect(existsSync(output)).toBe(false);
  });

  it("lets the local user import and export anywhere", async () => {
    const { call, outside, deckId } = await setup();

    await expect(
      call("deck.importImage", { path: path.join(outside, "outside.png") }),
    ).resolves.toMatchObject({ width: 3, height: 2 });
    const output = path.join(outside, "nested", "export.pdf");
    await call("deck.exportFile", {
      id: deckId,
      outputPath: output,
      format: "pdf",
    });
    expect(existsSync(output)).toBe(true);
  });
});
