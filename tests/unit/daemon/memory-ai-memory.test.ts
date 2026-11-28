import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BuiltinMemoryProvider } from "@cocurdex/daemon/internal/memory/builtin-provider";
import {
  AiMemoryLibrary,
  aiMemoryDataDir,
} from "@cocurdex/daemon/internal/memory/external/ai-memory-library";
import {
  applyMemorySync,
  isEmptyMemorySync,
  planMemorySync,
} from "@cocurdex/daemon/internal/memory/library-sync";
import {
  type FakeAiMemory,
  startFakeAiMemory,
} from "@cocurdex/test-fixtures/fake-ai-memory";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "./helpers/memory-store";

const dirs = createTempDirs();
afterAll(() => dirs.cleanup());

const servers: FakeAiMemory[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function startServer() {
  const server = await startFakeAiMemory({
    token: TOKEN,
    startAt: new Date(Date.UTC(2026, 10, 16)),
  });
  servers.push(server);
  return server;
}

const TOKEN = "test-token";

function library(
  serverUrl: string,
  options: { env?: NodeJS.ProcessEnv; dataDir?: string } = {},
) {
  return new AiMemoryLibrary({
    serverUrl: () => serverUrl,
    dataDir: () => options.dataDir ?? "/nonexistent-ai-memory",
    env: options.env ?? { AI_MEMORY_AUTH_TOKEN: TOKEN },
    device: "test-host",
    now: () => new Date(Date.UTC(2026, 10, 15)),
  });
}

describe("AiMemoryLibrary", () => {
  it("keeps every memory field across a sync round trip", async () => {
    const fake = await startServer();
    const remote = library(fake.url);
    let tick = 0;
    const now = () => new Date(Date.UTC(2026, 10, 15, 0, 0, tick++));
    const store = createMemoryStore();
    const builtin = new BuiltinMemoryProvider({
      ...store,
      device: "test-host",
      now,
    });
    const sync = async () => {
      const plan = planMemorySync(
        store.entries.all(),
        await remote.snapshot(),
        store.entries.remoteIds(remote.id),
      );
      const failed = await applyMemorySync(plan, {
        builtin,
        entries: store.entries,
        transaction: store.transaction,
        external: remote,
        now,
      });
      return { plan, failed };
    };
    const parent = await builtin.remember({
      title: "Deploys",
      content: "Release notes live in the wiki.",
      force: true,
    });
    await builtin.remember({
      title: "Staging host",
      content: "Staging deploys run on `ci-2` (see #12).",
      importance: "important",
      tags: ["ops"],
      project: "/work/acme-shop",
      parentId: parent.id ?? undefined,
      force: true,
    });

    expect((await sync()).failed).toBe(0);
    const [child] = (await remote.snapshot()).filter(
      (entry) => entry.title === "Staging host",
    );
    expect(child).toMatchObject({
      content: "Staging deploys run on `ci-2` (see #12).",
      importance: "important",
      tags: ["ops"],
      project: "/work/acme-shop",
      parentId: store.entries.remoteIds(remote.id).get(parent.id as string),
      device: "test-host",
    });
    expect(child.id.startsWith("work/acme-shop/")).toBe(true);
    expect(isEmptyMemorySync((await sync()).plan)).toBe(true);

    const recalled = await remote.recall({
      query: "staging ci-2",
      limit: 5,
      project: "/work/acme-shop",
    });
    expect(recalled.items.map((item) => item.id)).toEqual([child.id]);
    expect(
      (
        await remote.recall({
          query: "staging",
          limit: 5,
          project: "/work/other",
        })
      ).items,
    ).toEqual([]);

    await remote.update({ id: child.id, content: "Staging moved to ci-3." });
    expect((await sync()).failed).toBe(0);
    const local = store.entries.findByRemoteId(remote.id, child.id);
    expect(local?.content).toBe("Staging moved to ci-3.");
    expect(local?.parentId).toBe(parent.id);
  });

  it("reads the token from ai-memory's data dir", async () => {
    const fake = await startServer();
    const dataDir = await dirs.create("ai-memory-");
    await mkdir(path.join(dataDir, "auth-tokens"));
    await writeFile(
      path.join(dataDir, "auth-tokens", "default"),
      `${TOKEN}\r\n`,
      "utf8",
    );
    const remote = library(fake.url, { env: {}, dataDir });
    expect(await remote.identity()).toMatchObject({ version: "3.6.4" });
  });

  it("reports a missing token or server as unavailable", async () => {
    const fake = await startServer();
    const noToken = library(fake.url, { env: {} });
    await expect(noToken.snapshot()).rejects.toMatchObject({
      reason: "memory.providerUnavailable",
    });
    expect(await noToken.available()).toBe(false);
    const down = library("http://127.0.0.1:9");
    await expect(down.snapshot()).rejects.toMatchObject({
      reason: "memory.providerUnavailable",
    });
  });

  it("refuses to update a page ai-memory no longer has", async () => {
    const fake = await startServer();
    const remote = library(fake.url);
    const created = await remote.remember({ title: "A", content: "a" });
    fake.pages.delete(created.id as string);
    await expect(
      remote.update({ id: created.id as string, content: "b" }),
    ).rejects.toMatchObject({ reason: "memory.notFound" });
    expect(await remote.snapshot()).toEqual([]);
  });
});

describe("aiMemoryDataDir", () => {
  it("follows ai-memory's data dir on each platform", () => {
    expect(
      aiMemoryDataDir({ platform: "darwin", env: {}, homeDir: "/Users/a" }),
    ).toBe("/Users/a/Library/Application Support/ai-memory");
    expect(
      aiMemoryDataDir({
        platform: "win32",
        env: { LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" },
        homeDir: "C:\\Users\\a",
      }),
    ).toBe("C:\\Users\\a\\AppData\\Local\\ai-memory");
    expect(
      aiMemoryDataDir({ platform: "linux", env: {}, homeDir: "/home/a" }),
    ).toBe("/home/a/.local/share/ai-memory");
    expect(
      aiMemoryDataDir({
        platform: "linux",
        env: { XDG_DATA_HOME: "relative" },
        homeDir: "/home/a",
      }),
    ).toBe("/home/a/.local/share/ai-memory");
    expect(
      aiMemoryDataDir({
        platform: "linux",
        env: { AI_MEMORY_DATA_DIR: "/srv/mem" },
        homeDir: "/home/a",
      }),
    ).toBe("/srv/mem");
  });
});
