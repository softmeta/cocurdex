import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import {
  installManagedRsrsCli,
  managedRsrsPath,
} from "@cocurdex/daemon/internal/memory/rsrs-install";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const temp = createTempDirs();
const served = new Map<string, Buffer>();
let requests: string[] = [];
let baseUrl = "";

const server = createServer((request, response) => {
  const name = (request.url ?? "").slice(1);
  requests.push(name);
  const body = served.get(name);
  if (!body) {
    response.statusCode = 404;
    response.end();
    return;
  }
  response.end(body);
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await temp.cleanup();
});

function assetFor(file: string, bytes: Buffer, sha256?: string) {
  served.set(file, bytes);
  return {
    target: "test-target",
    file,
    sha256: sha256 ?? createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
  };
}

describe("installManagedRsrsCli", () => {
  it("installs the pinned CLI into the private home once and keeps it", async () => {
    requests = [];
    const dataDir = await temp.create("cocurdex-rsrs-home-");
    const asset = assetFor("rsrs-ok", Buffer.from("pinned rsrs build"));
    const input = { dataDir, os: process.platform, asset, baseUrl };

    const first = await installManagedRsrsCli(input);
    const second = await installManagedRsrsCli(input);

    const target = managedRsrsPath(dataDir, process.platform);
    expect(first).toEqual({ command: target, replaced: false });
    expect(second).toEqual({ command: target, replaced: false });
    expect(await readFile(target, "utf8")).toBe("pinned rsrs build");
    if (process.platform !== "win32") {
      expect((await stat(target)).mode & 0o111).not.toBe(0);
    }
    expect(requests).toEqual(["rsrs-ok"]);
  });

  it("refuses a download whose digest differs and keeps the installed CLI", async () => {
    const dataDir = await temp.create("cocurdex-rsrs-home-");
    const good = assetFor("rsrs-good", Buffer.from("previous build"));
    await installManagedRsrsCli({
      dataDir,
      os: process.platform,
      asset: good,
      baseUrl,
    });
    let stopped = false;
    const tampered = assetFor(
      "rsrs-tampered",
      Buffer.from("tampered build!"),
      createHash("sha256").update("expected build!").digest("hex"),
    );

    await expect(
      installManagedRsrsCli({
        dataDir,
        os: process.platform,
        asset: tampered,
        baseUrl,
        beforeReplace: async () => {
          stopped = true;
        },
      }),
    ).rejects.toThrow("Checksum mismatch");

    const target = managedRsrsPath(dataDir, process.platform);
    expect(await readFile(target, "utf8")).toBe("previous build");
    expect(await readdir(path.dirname(target))).toEqual([
      path.basename(target),
    ]);
    expect(stopped).toBe(false);
  });
});
