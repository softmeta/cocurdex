import { describe, expect, it } from "vitest";
import { detectAgentInstallations } from "./agent-installation";
import { createAgentRegistry } from "./agent-registry";

describe("createAgentRegistry", () => {
  it("returns Claude Agent metadata first with native-write capability", () => {
    const registry = createAgentRegistry();
    const claude = registry.list()[0];

    expect(claude.id).toBe("claude-agent");
    expect(claude.capabilities.writeModes).toEqual([
      "read-only",
      "native-write",
    ]);
    expect(claude.capabilities.supportsSteering).toBe(true);
    expect(claude.capabilities.collaborationModes).toEqual(["default", "plan"]);
    expect(claude.capabilities.permissionModes).toEqual([
      { id: "claude-default", risk: "normal" },
      { id: "claude-accept-edits", risk: "elevated" },
      { id: "claude-bypass-permissions", risk: "dangerous" },
    ]);
  });

  it("only advertises steering for adapters with a native mid-turn input path", () => {
    const agents = createAgentRegistry().list();
    const supportsSteering = Object.fromEntries(
      agents.map((agent) => [agent.id, agent.capabilities.supportsSteering]),
    );

    expect(supportsSteering).toEqual({
      "claude-agent": true,
      codex: true,
      opencode: false,
      "grok-build": true,
      pi: true,
    });
  });

  it("advertises each adapter's session title strategy", () => {
    const agents = createAgentRegistry().list();
    const sessionTitleStrategies = Object.fromEntries(
      agents.map((agent) => [
        agent.id,
        agent.capabilities.sessionTitleStrategy,
      ]),
    );

    expect(sessionTitleStrategies).toEqual({
      "claude-agent": "adapter-generated",
      codex: "adapter-generated",
      opencode: "native",
      "grok-build": "native",
      pi: "app-generated",
    });
  });

  it("marks supported agents from command lookup results", async () => {
    const registry = createAgentRegistry();
    const agents = await detectAgentInstallations(registry.list(), {
      lookupCommand: async (command) =>
        command === "codex" ? "/usr/local/bin/codex" : null,
    });

    expect(agents.find((agent) => agent.id === "codex")).toMatchObject({
      availability: "available",
      installation: {
        executableName: "codex",
        executablePath: "/usr/local/bin/codex",
      },
    });
    expect(agents.find((agent) => agent.id === "claude-agent")).toMatchObject({
      availability: "missing",
      installation: {
        executableName: "claude",
        executablePath: null,
      },
    });
    expect(agents.find((agent) => agent.id === "opencode")).toMatchObject({
      availability: "missing",
      installation: {
        executableName: "opencode",
        executablePath: null,
      },
    });
    expect(agents.find((agent) => agent.id === "grok-build")).toMatchObject({
      availability: "missing",
      capabilities: {
        transport: "acp",
      },
      installation: {
        executableName: "grok",
        executablePath: null,
      },
    });
    expect(agents.find((agent) => agent.id === "pi")).toMatchObject({
      availability: "available",
      installation: null,
    });
  });

  it("keeps built-in Pi available without probing a local pi command", async () => {
    const registry = createAgentRegistry();
    const seenCommands: string[] = [];
    const agents = await detectAgentInstallations(registry.list(), {
      lookupCommand: async (command) => {
        seenCommands.push(command);
        return null;
      },
    });

    expect(seenCommands).not.toContain("pi");
    expect(agents.find((agent) => agent.id === "pi")).toMatchObject({
      availability: "available",
      label: "Pi",
      capabilities: {
        supportsStreaming: true,
      },
      installation: null,
    });
  });
});
