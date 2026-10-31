import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import { buildDaemonFileUrl } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DaemonProcess, spawnDaemon } from "./helpers/daemon-process";
import {
  createGitRepository,
  type GitRepositoryFixture,
} from "./helpers/git-repository";

const tempDirs = createTempDirs();

function directChildren(
  entries: { kind: string; relativePath: string }[],
  directory: string,
) {
  return entries
    .filter(
      (entry) =>
        path.posix.dirname(entry.relativePath) === directory &&
        entry.relativePath !== directory,
    )
    .map(({ kind, relativePath }) => ({ kind, relativePath }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

describe("workspace.listDirectory over a real daemon", () => {
  let daemon: DaemonProcess;
  let repo: GitRepositoryFixture;
  let rootPath: string;

  beforeAll(async () => {
    daemon = await spawnDaemon();
    repo = await createGitRepository();
    rootPath = await realpath(repo.path);
    await mkdir(path.join(rootPath, "src", "auth", "nested"), {
      recursive: true,
    });
    await writeFile(path.join(rootPath, "src", "auth", "token.ts"), "x\n");
    await writeFile(
      path.join(rootPath, "src", "auth", "nested", "a.ts"),
      "x\n",
    );
    await writeFile(path.join(rootPath, "src", "index.ts"), "x\n");
    const now = "2026-10-21T00:00:00.000Z";
    await requestDaemon(
      "workspace.save",
      {
        workspace: {
          id: "files-workspace",
          name: "acme-files",
          rootPaths: [rootPath],
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now,
          sortOrder: 0,
        },
      },
      daemon.options,
    );
  });

  afterAll(async () => {
    await daemon.dispose();
    await repo.dispose();
    await tempDirs.cleanup();
  });

  it("lists one level that matches the full workspace listing", async () => {
    const all = await requestDaemon(
      "workspace.listFiles",
      { rootPath },
      daemon.options,
    );
    for (const directory of [".", "src", "src/auth"]) {
      const children = await requestDaemon(
        "workspace.listDirectory",
        { rootPath, relativePath: directory },
        daemon.options,
      );
      expect(
        children
          .map(({ kind, relativePath }) => ({ kind, relativePath }))
          .sort((left, right) =>
            left.relativePath.localeCompare(right.relativePath),
          ),
      ).toEqual(directChildren(all, directory));
    }
  });

  it("returns nothing for a root outside every workspace", async () => {
    const outside = await realpath(tempDirs.createSync("cocu-outside-"));
    await mkdir(path.join(outside, "private"));
    await writeFile(path.join(outside, "private", "key.txt"), "x\n");

    const children = await requestDaemon(
      "workspace.listDirectory",
      { rootPath: outside, relativePath: "private" },
      daemon.options,
    );
    expect(children).toEqual([]);
  });

  it("rejects a relative path that leaves the root", async () => {
    await expect(
      requestDaemon(
        "workspace.listDirectory",
        { rootPath, relativePath: "../.." },
        daemon.options,
      ),
    ).rejects.toThrow();
  });
});

describe("workspace file streaming over a real daemon", () => {
  let daemon: DaemonProcess;
  let rootPath: string;
  const source = "export const total = 0;\n".repeat(64);
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

  const fetchFile = (filePath: string, headers: Record<string, string> = {}) =>
    fetch(buildDaemonFileUrl(daemon.metadata.webSocketUrl, filePath), {
      headers: { Authorization: `Bearer ${daemon.metadata.token}`, ...headers },
    });

  beforeAll(async () => {
    daemon = await spawnDaemon();
    rootPath = await realpath(tempDirs.createSync("cocu-raw-"));
    await mkdir(path.join(rootPath, "src"));
    await writeFile(path.join(rootPath, "src", "cart.ts"), source);
    await writeFile(path.join(rootPath, "logo.png"), png);
    const now = "2026-10-25T00:00:00.000Z";
    await requestDaemon(
      "workspace.save",
      {
        workspace: {
          id: "raw-workspace",
          name: "acme-raw",
          rootPaths: [rootPath],
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now,
          sortOrder: 0,
        },
      },
      daemon.options,
    );
  });

  afterAll(async () => {
    await daemon.dispose();
    await tempDirs.cleanup();
  });

  it("streams a bounded prefix of a text file", async () => {
    const response = await fetchFile(path.join(rootPath, "src", "cart.ts"), {
      Range: "bytes=0-99",
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(response.headers.get("content-range")).toBe(
      `bytes 0-99/${Buffer.byteLength(source)}`,
    );
    expect(await response.text()).toBe(source.slice(0, 100));
  });

  it("serves images with their own type inside a sandbox", async () => {
    const response = await fetchFile(path.join(rootPath, "logo.png"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-security-policy")).toContain(
      "sandbox",
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
  });

  it("refuses files outside every workspace", async () => {
    const outside = await realpath(tempDirs.createSync("cocu-raw-outside-"));
    const secret = path.join(outside, "key.txt");
    await writeFile(secret, "secret\n");
    expect((await fetchFile(secret)).status).toBe(403);
    expect(
      (
        await fetchFile(
          path.join(rootPath, "..", path.basename(outside), "key.txt"),
        )
      ).status,
    ).toBe(403);
  });
});
