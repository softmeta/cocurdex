import {
  ChildProcess,
  type ChildProcessWithoutNullStreams,
  spawn,
} from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listClaudeCliProviderModels,
  resetClaudeCliProviderModelsCache,
} from "./claude-cli-models";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: vi.fn(),
}));

const model = {
  value: "sonnet",
  displayName: "Sonnet",
  description: "Account model",
};

let probeCwd: string;
let initialEntries: string[];
let child: ChildProcessWithoutNullStreams;
let responseMode: "models" | "error" | "silent";

function createProbe() {
  const stdout = new PassThrough();
  child = Object.assign(new ChildProcess(), {
    stdin: new PassThrough(),
    stdout,
    stderr: new PassThrough(),
  }) as ChildProcessWithoutNullStreams;
  vi.spyOn(child, "kill").mockImplementation((signal) => {
    queueMicrotask(() => {
      Object.defineProperty(child, "signalCode", {
        value: signal,
        configurable: true,
      });
      child.emit("exit", null, signal);
      child.emit("close", null, signal);
    });
    return true;
  });
  child.stdin.once("data", (data: Buffer) => {
    if (responseMode === "silent") return;
    const request = JSON.parse(data.toString());
    queueMicrotask(() => {
      stdout.write(
        `${JSON.stringify({
          type: "control_response",
          response: {
            subtype: responseMode === "error" ? "error" : "success",
            error: "Initialization failed",
            request_id: request.request_id,
            response: { models: [model] },
          },
        })}\n`,
      );
    });
  });
  return child;
}

describe("Claude model probe isolation", () => {
  beforeEach(() => {
    resetClaudeCliProviderModelsCache();
    responseMode = "models";
    vi.mocked(spawn).mockImplementation((_executable, _args, options) => {
      probeCwd = String(options?.cwd);
      initialEntries = readdirSync(probeCwd);
      return createProbe();
    });
  });

  afterEach(() => {
    child?.stdin.destroy();
    child?.stdout.destroy();
    child?.stderr.destroy();
    vi.restoreAllMocks();
    vi.mocked(spawn).mockReset();
    vi.useRealTimers();
  });

  it("reads account models without using the home directory or starting integrations", async () => {
    const models = await listClaudeCliProviderModels(
      async () => "/installed/claude",
    );

    expect(models).toContainEqual(
      expect.objectContaining({
        model: expect.objectContaining({ modelId: "sonnet", source: "api" }),
      }),
    );
    expect(probeCwd).not.toBe(homedir());
    expect(initialEntries).toEqual([]);
    const args = vi.mocked(spawn).mock.calls[0]?.[1] as string[];
    expect(args).toEqual(
      expect.arrayContaining([
        "--safe-mode",
        "--setting-sources=user",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--no-session-persistence",
      ]),
    );
    expect(args).not.toContain("--bare");
    expect(JSON.parse(args[args.indexOf("--mcp-config") + 1])).toEqual({
      mcpServers: {},
    });
    expect(JSON.parse(args[args.indexOf("--settings") + 1])).toMatchObject({
      disableAllHooks: true,
    });
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(existsSync(probeCwd)).toBe(false);
  });

  it("cleans up after initialization fails", async () => {
    responseMode = "error";

    await expect(
      listClaudeCliProviderModels(async () => "/installed/claude"),
    ).rejects.toThrow("Initialization failed");

    expect(existsSync(probeCwd)).toBe(false);
    expect(child.signalCode).not.toBeNull();
  });

  it("cleans up when the process cannot be created", async () => {
    vi.mocked(spawn).mockImplementationOnce((_executable, _args, options) => {
      probeCwd = String(options?.cwd);
      throw new Error("Cannot spawn Claude");
    });

    await expect(
      listClaudeCliProviderModels(async () => "/installed/claude"),
    ).rejects.toThrow("Cannot spawn Claude");

    expect(existsSync(probeCwd)).toBe(false);
  });

  it("keeps the directory until an unresponsive process has stopped", async () => {
    vi.useFakeTimers();
    responseMode = "silent";
    const result = listClaudeCliProviderModels(async () => "/installed/claude");
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
    vi.mocked(child.kill).mockImplementationOnce(() => true);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(existsSync(probeCwd)).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);
    await result;

    expect(child.signalCode).toBe("SIGKILL");
    expect(existsSync(probeCwd)).toBe(false);
  });
});
