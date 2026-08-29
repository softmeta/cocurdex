import { createOpencodeClient } from "@opencode-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireOpenCodeRuntime,
  expectOpenCodeData,
  isOpenCodeVersionSupported,
  releaseOpenCodeRuntime,
} from "./opencode-runtime";

const serverMocks = vi.hoisted(() => ({
  start: vi.fn(),
}));
const v2Mocks = vi.hoisted(() => ({
  create: vi.fn(),
  health: vi.fn(),
}));

vi.mock("@opencode-ai/sdk", () => ({
  createOpencodeClient: vi.fn((options) => options),
}));

vi.mock("@opencode-ai/sdk/v2", () => ({
  createOpencodeClient: v2Mocks.create,
}));

vi.mock("./opencode-server", () => ({
  startOpenCodeServer: serverMocks.start,
}));

describe("acquireOpenCodeRuntime", () => {
  beforeEach(() => {
    v2Mocks.health.mockResolvedValue({
      data: { healthy: true, version: "1.18.12" },
    });
    v2Mocks.create.mockImplementation((options) => ({
      ...options,
      global: { health: v2Mocks.health },
    }));
    serverMocks.start.mockImplementation(
      async ({ workspaceRootPath }: { workspaceRootPath: string }) => ({
        url: `http://127.0.0.1:${workspaceRootPath.endsWith("-b") ? "12346" : "12345"}`,
        close: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("starts one managed server in an app-owned temporary workspace", async () => {
    const runtime = await acquireOpenCodeRuntime();

    expect(serverMocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "127.0.0.1",
        onLaunch: expect.any(Function),
        onOutput: expect.any(Function),
        workspaceRootPath: expect.stringContaining("cocurdex-opencode-managed"),
      }),
    );
    expect(createOpencodeClient).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:12345",
      directory: expect.stringContaining("cocurdex-opencode-managed"),
    });

    releaseOpenCodeRuntime(runtime);
  });

  it("reuses the managed server across workspace requests", async () => {
    const firstRuntime = await acquireOpenCodeRuntime();
    const secondRuntime = await acquireOpenCodeRuntime();

    expect(serverMocks.start).toHaveBeenCalledOnce();
    expect(firstRuntime).toBe(secondRuntime);

    releaseOpenCodeRuntime(firstRuntime);
    releaseOpenCodeRuntime(secondRuntime);
  });

  it("rejects a server below the supported version", async () => {
    v2Mocks.health.mockResolvedValue({
      data: { healthy: true, version: "1.14.28" },
    });

    await expect(acquireOpenCodeRuntime()).rejects.toThrow(
      "Upgrade OpenCode to 1.14.29 or newer",
    );
  });

  it("explains OpenCode database schema failures with a repair action", async () => {
    await expect(
      expectOpenCodeData(
        Promise.resolve({
          error: { message: "SQLiteError: no such column: replacement_seq" },
        }),
        "send prompt",
      ),
    ).rejects.toThrow(
      "OpenCode's local database schema is incompatible with this OpenCode server",
    );
  });
});

describe("OpenCode version compatibility", () => {
  it("supports newer patch and minor versions without requiring exact SDK equality", () => {
    expect(isOpenCodeVersionSupported("1.14.29")).toBe(true);
    expect(isOpenCodeVersionSupported("1.18.12")).toBe(true);
    expect(isOpenCodeVersionSupported("1.14.28")).toBe(false);
  });
});
