import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AgentRuntimeProviderConfig } from "@cocurdex/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DaemonState } from "../state";

const generate = vi.hoisted(() => vi.fn());
vi.mock("@cocurdex/agent-adapters", () => ({
  generateAgentCommitMessage: generate,
}));

import { DaemonCommitMessageService } from "./service";

const execFileAsync = promisify(execFile);
const directories: string[] = [];
const providerConfig = {
  providerId: "provider",
  modelId: "model",
  api: "openai-responses",
  apiKey: "test-key",
  reasoningEffort: "high",
  fastMode: true,
  openCodeAgent: "build",
  openCodeVariant: "fast",
} as AgentRuntimeProviderConfig;

async function git(rootPath: string, ...args: string[]) {
  return (await execFileAsync("git", args, { cwd: rootPath })).stdout;
}

async function repository() {
  const rootPath = await mkdtemp(
    path.join(tmpdir(), "cocurdex-commit-daemon-"),
  );
  directories.push(rootPath);
  await git(rootPath, "init");
  await git(rootPath, "config", "user.name", "Tests");
  await git(rootPath, "config", "user.email", "tests@localhost");
  await writeFile(path.join(rootPath, "file.txt"), "original\n");
  await git(rootPath, "add", ".");
  await git(rootPath, "commit", "-m", "Initial");
  return rootPath;
}

function service() {
  return new DaemonCommitMessageService({
    getChatDatabase: vi.fn().mockResolvedValue({}),
  } as unknown as DaemonState);
}

beforeEach(() => {
  generate.mockReset();
  generate.mockResolvedValue("feat: draft");
});

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("daemon commit message generation", () => {
  it("uses the staged content and preserves partial staging", async () => {
    const rootPath = await repository();
    await writeFile(path.join(rootPath, "file.txt"), "staged-content\n");
    await git(rootPath, "add", ".");
    await writeFile(path.join(rootPath, "file.txt"), "worktree-content\n");
    const indexBefore = await readFile(path.join(rootPath, ".git/index"));
    const headBefore = await git(rootPath, "rev-parse", "HEAD");

    await expect(
      service().generate({
        workspaceRootPath: rootPath,
        includeUnstaged: false,
        agentId: "pi",
        providerConfig,
      }),
    ).resolves.toBe("feat: draft");

    const request = generate.mock.calls[0][0];
    expect(request.changeSummary).toContain("+staged-content");
    expect(request.changeSummary).not.toContain("+worktree-content");
    expect(request.providerConfig).toEqual(providerConfig);
    expect(request.providerSnapshot).not.toHaveProperty("apiKey");
    expect(request.providerSnapshot).toMatchObject({
      reasoningEffort: "high",
      fastMode: true,
      openCodeAgent: "build",
      openCodeVariant: "fast",
    });
    expect(await readFile(path.join(rootPath, ".git/index"))).toEqual(
      indexBefore,
    );
    expect(await git(rootPath, "rev-parse", "HEAD")).toBe(headBefore);
  });

  it.each([
    false,
    true,
  ])("keeps the real index intact after generation failure=%s", async (fail) => {
    const rootPath = await repository();
    await writeFile(path.join(rootPath, "file.txt"), "staged-content\n");
    await git(rootPath, "add", ".");
    await writeFile(path.join(rootPath, "file.txt"), "worktree-content\n");
    await writeFile(path.join(rootPath, "new.txt"), "new-content\n");
    const indexTree = await git(rootPath, "write-tree");
    const staged = await git(rootPath, "diff", "--cached");
    if (fail) generate.mockRejectedValueOnce(new Error("Model failed"));

    const result = service().generate({
      workspaceRootPath: rootPath,
      includeUnstaged: true,
      agentId: "pi",
      providerConfig,
    });
    if (fail) await expect(result).rejects.toThrow("Model failed");
    else await expect(result).resolves.toBe("feat: draft");

    expect(generate.mock.calls[0][0].changeSummary).toContain(
      "+worktree-content",
    );
    expect(generate.mock.calls[0][0].changeSummary).toContain("+new-content");
    expect(await git(rootPath, "write-tree")).toBe(indexTree);
    expect(await git(rootPath, "diff", "--cached")).toBe(staged);
  });

  it("rejects an empty index without calling the model", async () => {
    const rootPath = await repository();
    await expect(
      service().generate({
        workspaceRootPath: rootPath,
        includeUnstaged: false,
        agentId: "pi",
        providerConfig,
      }),
    ).rejects.toThrow("Nothing to commit");
    expect(generate).not.toHaveBeenCalled();
  });

  it("reports an incomplete model response", async () => {
    const rootPath = await repository();
    await writeFile(path.join(rootPath, "new.txt"), "new\n");
    generate.mockResolvedValueOnce("");
    await expect(
      service().generate({
        workspaceRootPath: rootPath,
        includeUnstaged: true,
        agentId: "pi",
        providerConfig,
      }),
    ).rejects.toThrow("Model returned an incomplete commit message");
  });
});
