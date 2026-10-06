import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  make: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock("cross-spawn", () => ({ default: { sync: mocks.spawnSync } }));
vi.mock("@opencode/client", () => ({ OpenCode: { make: mocks.make } }));
vi.mock("@opencode/client/service", () => ({
  Service: {
    ensure: mocks.ensure,
    headers: (endpoint: { auth?: { username: string; password: string } }) =>
      endpoint.auth
        ? {
            authorization: `Basic ${Buffer.from(
              `${endpoint.auth.username}:${endpoint.auth.password}`,
            ).toString("base64")}`,
          }
        : undefined,
  },
}));

async function loadRuntime() {
  vi.resetModules();
  return import("./opencode-runtime");
}

describe("connectOpenCode", () => {
  beforeEach(() => {
    mocks.ensure.mockReset();
    mocks.make.mockReset();
    mocks.spawnSync.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("connects to the shared background service with its credentials", async () => {
    mocks.spawnSync.mockReturnValue({ stdout: "opencode v2.0.20\n" });
    mocks.ensure.mockResolvedValue({
      url: "http://127.0.0.1:49374",
      auth: { type: "basic", username: "opencode", password: "secret" },
    });
    mocks.make.mockReturnValue({ client: true });
    const { connectOpenCode } = await loadRuntime();

    await expect(connectOpenCode()).resolves.toEqual({ client: true });

    expect(mocks.make).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:49374",
      headers: {
        authorization: `Basic ${Buffer.from("opencode:secret").toString("base64")}`,
      },
    });
  });

  it("rejects an installed OpenCode below the supported version", async () => {
    mocks.spawnSync.mockReturnValue({ stdout: "1.18.33\n" });
    const { connectOpenCode } = await loadRuntime();

    await expect(connectOpenCode()).rejects.toThrow(
      "OpenCode 1.18.33 is too old for Cocurdex",
    );
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  it("explains a missing OpenCode CLI", async () => {
    mocks.spawnSync.mockReturnValue({ error: new Error("spawn ENOENT") });
    const { connectOpenCode } = await loadRuntime();

    await expect(connectOpenCode()).rejects.toThrow(
      "OpenCode CLI was not found on PATH",
    );
  });
});
