import { copyFileSync, readdirSync, writeFileSync } from "node:fs";
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
import { findDocImages, type HostPrincipal } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

const now = "2026-10-26T00:00:00.000Z";
const swatch = createRequire(import.meta.url).resolve(
  "./decks/fixtures/swatch-3x2.png",
);
const device: HostPrincipal = {
  kind: "device",
  deviceId: "phone-1",
  scopes: ["read", "interact", "files.read"],
};

async function setup() {
  const userDataPath = tempDirs.createSync("doc-image-");
  const workspace = tempDirs.createSync("doc-image-ws-");
  const outside = tempDirs.createSync("doc-image-out-");
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "doc-image-test",
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
  const storedImages = () => {
    try {
      return readdirSync(path.join(userDataPath, "image-attachments"));
    } catch {
      return [];
    }
  };
  return { call, workspace, outside, storedImages };
}

describe("doc image RPC", () => {
  it("imports a file into a markdown reference that resolves back to it", async () => {
    const { call, outside } = await setup();

    const image = await call("image.import", {
      path: path.join(outside, "outside.png"),
      name: "Checkout [old] flow",
    });

    expect(image).toMatchObject({ width: 3, height: 2, mimeType: "image/png" });
    expect(image.uri).toBe(`cocurdex://image/${image.fileName}`);
    expect(findDocImages(`Before ${image.markdown} after`)).toEqual([
      expect.objectContaining({
        alt: "Checkout [old] flow",
        fileName: image.fileName,
      }),
    ]);
    await expect(call("image.locate", { uri: image.uri })).resolves.toEqual({
      uri: image.uri,
      fileName: image.fileName,
      filePath: image.filePath,
      mimeType: "image/png",
      sizeBytes: image.sizeBytes,
    });
  });

  it("reports unknown images as missing and rejects foreign references", async () => {
    const { call } = await setup();

    await expect(
      call("image.locate", {
        uri: "cocurdex://image/00000000-0000-0000-0000-000000000000.png",
      }),
    ).resolves.toBeNull();
    await expect(
      call("image.locate", { uri: "cocurdex://image/../cocurdex.sqlite" }),
    ).rejects.toThrow(/Not a Cocurdex image reference/);
  });

  it("refuses files that are not images and leaves nothing behind", async () => {
    const { call, outside, storedImages } = await setup();
    const text = path.join(outside, "notes.png");
    writeFileSync(text, "not an image", "utf8");

    await expect(call("image.import", { path: text })).rejects.toThrow(
      /Only PNG, JPEG, GIF, or WebP/,
    );
    expect(storedImages()).toEqual([]);
  });

  it("confines remote devices to registered workspaces", async () => {
    const { call, workspace, outside, storedImages } = await setup();

    await expect(
      call("image.import", { path: path.join(outside, "outside.png") }, device),
    ).rejects.toThrow(/outside every registered workspace/);
    expect(storedImages()).toEqual([]);
    await expect(
      call(
        "image.import",
        { path: path.join(workspace, "inside.png") },
        device,
      ),
    ).resolves.toMatchObject({ width: 3, height: 2 });

    const reader: HostPrincipal = {
      kind: "device",
      deviceId: "reader-1",
      scopes: ["read", "files.read"],
    };
    expect(authorizeDaemonRequest(reader, "image.import", true)).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(authorizeDaemonRequest(reader, "image.locate", true)).toMatchObject({
      ok: true,
    });
  });
});
