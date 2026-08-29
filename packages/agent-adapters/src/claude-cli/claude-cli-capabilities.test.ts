import { describe, expect, it, vi } from "vitest";
import { discoverClaudeCliCapabilities } from "./claude-cli-capabilities";

describe("discoverClaudeCliCapabilities", () => {
  it("reports the known permission modes accepted by the installed CLI", async () => {
    const supportedModes = new Set([
      "default",
      "acceptEdits",
      "auto",
      "bypassPermissions",
      "plan",
    ]);
    const runClaude = vi.fn(async (_executablePath: string, args: string[]) => {
      if (args[0] === "--version") {
        return { stdout: "2.1.220 (Claude Code)\n" };
      }

      const mode = args[1];
      if (!mode || !supportedModes.has(mode)) {
        throw new Error(`Unsupported permission mode: ${mode}`);
      }
      return { stdout: "2.1.220 (Claude Code)\n" };
    });

    const result = await discoverClaudeCliCapabilities(
      "/usr/local/bin/claude",
      runClaude,
    );

    expect(result.version).toBe("2.1.220 (Claude Code)");
    expect(result.capabilities.permissionModes).toEqual([
      { id: "claude-default", risk: "normal" },
      { id: "claude-accept-edits", risk: "elevated" },
      { id: "claude-auto", risk: "elevated" },
      { id: "claude-bypass-permissions", risk: "dangerous" },
    ]);
    expect(runClaude).not.toHaveBeenCalledWith("/usr/local/bin/claude", [
      "--permission-mode",
      "plan",
      "--version",
    ]);
  });

  it("falls back to the established modes when capability probing fails", async () => {
    const runClaude = vi.fn(async (_executablePath: string, args: string[]) => {
      if (args[0] === "--version") {
        return { stdout: "1.0.0 (Claude Code)\n" };
      }
      throw new Error("Probe failed");
    });

    const result = await discoverClaudeCliCapabilities(
      "/usr/local/bin/claude",
      runClaude,
    );

    expect(result.capabilities.permissionModes).toEqual([
      { id: "claude-default", risk: "normal" },
      { id: "claude-accept-edits", risk: "elevated" },
      { id: "claude-bypass-permissions", risk: "dangerous" },
    ]);
  });
});
