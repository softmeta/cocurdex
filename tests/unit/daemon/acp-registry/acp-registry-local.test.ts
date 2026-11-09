import { findLocalCliAgent } from "@cocurdex/daemon/internal/acp-registry/acp-registry-local";
import { describe, expect, it, vi } from "vitest";

describe("findLocalCliAgent", () => {
  it("adopts the agy CLI as `agy acp` once it can serve ACP", async () => {
    const lookup = vi.fn(async () => "/opt/bin/agy");
    const readVersion = vi.fn(async () => "1.5.3");

    const agent = await findLocalCliAgent(
      "antigravity-acp",
      lookup,
      () => new Date("2026-11-09T00:00:00.000Z"),
      readVersion,
    );

    expect(readVersion).toHaveBeenCalledWith("/opt/bin/agy");
    expect(agent).toMatchObject({
      agentId: "acp:antigravity-acp",
      registryId: "antigravity-acp",
      name: "Google Antigravity",
      version: "1.5.3",
      distribution: "local",
      command: "/opt/bin/agy",
      args: ["acp"],
      env: {},
      installedAt: "2026-11-09T00:00:00.000Z",
    });
  });

  it("ignores an agy CLI that predates the acp subcommand", async () => {
    const agent = await findLocalCliAgent(
      "antigravity-acp",
      async () => "/opt/bin/agy",
      () => new Date(),
      async () => "1.4.9",
    );

    expect(agent).toBeNull();
  });

  it("does not probe a version for CLIs that have always served ACP", async () => {
    const readVersion = vi.fn(async () => "9.9.9");

    const agent = await findLocalCliAgent(
      "cursor",
      async () => "/opt/bin/cursor-agent",
      () => new Date("2026-11-09T00:00:00.000Z"),
      readVersion,
    );

    expect(readVersion).not.toHaveBeenCalled();
    expect(agent).toMatchObject({
      version: "",
      command: "/opt/bin/cursor-agent",
      args: ["acp"],
    });
  });

  it("returns null when the command is not installed", async () => {
    await expect(
      findLocalCliAgent("antigravity-acp", async () => null),
    ).resolves.toBeNull();
  });
});
