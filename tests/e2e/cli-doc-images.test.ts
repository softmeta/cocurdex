import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { requestDaemon } from "@cocurdex/daemon/client";
import {
  buildDaemonImageAttachmentUrl,
  type DocImage,
  type DocImageFile,
  findDocImages,
} from "@cocurdex/shared";
import {
  type DaemonProcess,
  spawnDaemon,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";

const SWATCH_PNG = createRequire(import.meta.url).resolve(
  "./fixtures/deck-images/swatch-3x2.png",
);

describe("images in note and issue bodies through the CLI", () => {
  let daemon: DaemonProcess;

  beforeAll(async () => {
    daemon = await spawnDaemon();
  });

  afterAll(async () => {
    await daemon.dispose();
  });

  it("imports an image, embeds it in an issue, and reads it back", async () => {
    const options = { userDataPath: daemon.userDataPath };
    const imported = await runCli(
      ["image", "import", SWATCH_PNG, "--name", "Cart total", "--json"],
      options,
    );
    expect(imported.stderr).toBe("");
    const image = JSON.parse(imported.stdout) as DocImage;
    expect(image).toMatchObject({ width: 3, height: 2, mimeType: "image/png" });

    const created = await runCli(
      [
        "issue",
        "create",
        "--title",
        "Cart total is wrong",
        "--body",
        `Repro: ${image.markdown}`,
        "--json",
      ],
      options,
    );
    const issue = JSON.parse(created.stdout) as { id: string };
    const stored = await requestDaemon(
      "issue.get",
      { id: issue.id },
      daemon.options,
    );
    const [embedded] = findDocImages(stored?.description ?? "");
    expect(embedded).toMatchObject({
      alt: "Cart total",
      fileName: image.fileName,
    });

    const located = await runCli(
      ["image", "locate", image.uri, "--json"],
      options,
    );
    const file = JSON.parse(located.stdout) as DocImageFile;
    expect(await readFile(file.filePath)).toEqual(await readFile(SWATCH_PNG));

    const url = buildDaemonImageAttachmentUrl(
      daemon.metadata.webSocketUrl,
      image.fileName,
    );
    expect((await fetch(url)).status).toBe(401);
    const served = await fetch(url, {
      headers: { Authorization: `Bearer ${daemon.metadata.token}` },
    });
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await served.arrayBuffer())).toEqual(
      await readFile(SWATCH_PNG),
    );
  });

  it("fails clearly for a missing image reference", async () => {
    const result = await runCli(
      [
        "image",
        "locate",
        "cocurdex://image/00000000-0000-0000-0000-000000000000.png",
      ],
      { userDataPath: daemon.userDataPath },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Image not found");
  });
});
