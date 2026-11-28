import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AiMemoryExternal,
  type AiMemoryHostDeps,
} from "@cocurdex/daemon/internal/memory/external/ai-memory-external";
import {
  AI_MEMORY_DEFAULT_SERVER_URL,
  DEFAULT_MEMORY_SETTINGS,
  type MemorySettings,
  withMemoryProvider,
  withMemoryProviderSettings,
} from "@cocurdex/shared";
import {
  type FakeAiMemory,
  startFakeAiMemory,
} from "@cocurdex/test-fixtures/fake-ai-memory";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const dirs = createTempDirs();
afterAll(() => dirs.cleanup());

const servers: FakeAiMemory[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

const TOKEN = "host-test-token";

interface Harness {
  external: AiMemoryExternal;
  calls: string[];
  hosted: { executable: string; dataDir: string; stopped: boolean }[];
  userDataPath: string;
  userDataDir: string;
}

async function harness(input: {
  serverRunning?: boolean;
  userBinary?: string | null;
  settings?: MemorySettings;
}): Promise<Harness> {
  const root = await dirs.create("ai-memory-host-");
  const userDataPath = path.join(root, "cocurdex");
  const userDataDir = path.join(root, "user-ai-memory");
  const calls: string[] = [];
  const hosted: Harness["hosted"] = [];
  const settings =
    input.settings ?? withMemoryProvider(DEFAULT_MEMORY_SETTINGS, "ai-memory");
  const deps: AiMemoryHostDeps = {
    answers: async (url) => {
      calls.push(`answers ${url}`);
      return input.serverRunning === true;
    },
    findExecutable: async () => input.userBinary ?? null,
    install: async () => {
      calls.push("install");
      return path.join(userDataPath, "ai-memory", "bin", "ai-memory");
    },
    init: async (executable, dataDir) => {
      calls.push(`init ${executable}`);
      await mkdir(path.join(dataDir, "auth-tokens"), { recursive: true });
      await writeFile(path.join(dataDir, "auth-tokens", "default"), TOKEN);
    },
    allocatePort: async () => 0,
    host: async ({ executable, dataDir }) => {
      const server = await startFakeAiMemory({ token: TOKEN });
      servers.push(server);
      const record = { executable, dataDir, stopped: false };
      hosted.push(record);
      return {
        url: server.url,
        dataDir,
        running: () => !record.stopped,
        stop: async () => {
          record.stopped = true;
          await server.close();
        },
      };
    },
  };
  const external = new AiMemoryExternal({
    settings: () => settings,
    dataDir: () => userDataDir,
    userDataPath,
    platform: { os: "darwin", arch: "arm64" },
    env: {},
    device: "test-host",
    now: () => new Date(Date.UTC(2026, 10, 28)),
    changed: () => undefined,
    host: deps,
  });
  return { external, calls, hosted, userDataPath, userDataDir };
}

describe("AiMemoryExternal setup", () => {
  it("reuses a server the user already runs without installing or hosting", async () => {
    const { external, calls, hosted } = await harness({ serverRunning: true });
    await external.start();
    expect(calls).toEqual([`answers ${AI_MEMORY_DEFAULT_SERVER_URL}`]);
    expect(hosted).toEqual([]);
    expect(external.library.serverUrl()).toBe(AI_MEMORY_DEFAULT_SERVER_URL);
  });

  it("hosts the user's installed binary on the user's data folder", async () => {
    const userBinary = "/opt/ai-memory/bin/ai-memory";
    const { external, calls, hosted, userDataDir } = await harness({
      userBinary,
    });
    await external.start();
    expect(calls).not.toContain("install");
    expect(hosted).toMatchObject([
      { executable: userBinary, dataDir: userDataDir },
    ]);
    await expect(external.status()).resolves.toMatchObject({
      available: true,
      preparing: false,
      version: "3.6.4",
    });
  });

  it("installs and hosts its own copy when the user has none, and stops it when another library is chosen", async () => {
    const { external, calls, hosted, userDataPath } = await harness({});
    await external.start();
    expect(calls).toContain("install");
    expect(hosted).toHaveLength(1);
    expect(hosted[0].dataDir.startsWith(userDataPath)).toBe(true);
    await expect(external.usable()).resolves.toBe(true);

    await external.stop();
    expect(hosted[0].stopped).toBe(true);
    expect(external.library.serverUrl()).toBe(AI_MEMORY_DEFAULT_SERVER_URL);
  });

  it("only connects to a server address the user set", async () => {
    const settings = withMemoryProviderSettings(
      withMemoryProvider(DEFAULT_MEMORY_SETTINGS, "ai-memory"),
      { aiMemory: { serverUrl: "http://127.0.0.1:9" } },
    );
    const { external, calls, hosted } = await harness({ settings });
    await external.start();
    expect(calls).toEqual([]);
    expect(hosted).toEqual([]);
    expect(external.library.serverUrl()).toBe("http://127.0.0.1:9");
  });
});
