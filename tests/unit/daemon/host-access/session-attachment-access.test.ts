import { writeFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { handleDaemonRequest } from "@cocurdex/daemon/internal/handler";
import { CocurdexDaemonService } from "@cocurdex/daemon/internal/service";
import type { DaemonRequest } from "@cocurdex/rpc";
import type {
  ContextFileAttachment,
  HostPrincipal,
  ImageAttachment,
  MessageAttachment,
} from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

const now = "2026-10-25T00:00:00.000Z";
const device: HostPrincipal = {
  kind: "device",
  deviceId: "phone-1",
  scopes: ["read", "interact", "files.read"],
};
const gif = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x04, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00,
]);

function contextFile(filePath: string): ContextFileAttachment {
  return {
    kind: "context-file",
    filePath,
    language: "text",
    selectedText: "",
    startLine: 1,
    endLine: 1,
    surroundingContext: "",
    contentOmitted: true,
  };
}

async function setup() {
  const userDataPath = tempDirs.createSync("send-access-");
  const workspace = tempDirs.createSync("send-access-ws-");
  const outside = tempDirs.createSync("send-access-out-");
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "send-access-test",
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
  writeFileSync(path.join(workspace, "inside.txt"), "inside", "utf8");
  writeFileSync(path.join(outside, "secret.txt"), "secret", "utf8");
  const stored = await service.attachments.importImage(
    Readable.from([gif]),
    "a.gif",
  );
  const send = (attachments: MessageAttachment[]) =>
    handleDaemonRequest<"session.send">(
      service,
      {
        id: "1",
        method: "session.send",
        params: {
          sessionId: "session-1",
          messageId: "message-1",
          content: "look",
          attachments,
        },
        token: "test",
      } as DaemonRequest<"session.send">,
      { principal: device, remoteAddress: "10.0.0.2" },
    );
  return { service, workspace, outside, stored, send };
}

describe("session.send attachment access", () => {
  it("refuses a device attachment outside every workspace or upload", async () => {
    const { service, outside, stored, send } = await setup();
    const forged: ImageAttachment = {
      ...stored,
      filePath: path.join(outside, "secret.txt"),
    };

    await expect(
      send([contextFile(path.join(outside, "secret.txt"))]),
    ).rejects.toThrow(/outside every registered workspace/);
    await expect(
      send([{ kind: "context-folder", folderPath: outside }]),
    ).rejects.toThrow(/outside every registered workspace/);
    await expect(send([forged])).rejects.toThrow(/not a stored upload/);
    await expect(
      service.state.listSessionMessages("session-1"),
    ).resolves.toMatchObject({ messages: [] });
  });

  it("lets a device attach stored uploads and workspace files", async () => {
    const { service, workspace, stored } = await setup();

    await expect(
      service.assertClientAttachmentsAccess(device, [
        stored,
        contextFile(path.join(workspace, "inside.txt")),
        { kind: "context-folder", folderPath: workspace },
      ]),
    ).resolves.toBeUndefined();
  });
});
