import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const centerPanelSource = readFileSync(
  resolve(__dirname, "../../app/layout/center-panel.tsx"),
  "utf8",
);

describe("CenterPanel logging", () => {
  it("does not emit routine agent session logs directly to console", () => {
    expect(centerPanelSource).not.toContain(
      'console.info("[AgentSession] start session send"',
    );
    expect(centerPanelSource).not.toContain(
      'console.info("[AgentSession] start session send completed"',
    );
    expect(centerPanelSource).not.toContain(
      'console.info("[AgentSession] send start"',
    );
    expect(centerPanelSource).not.toContain(
      'console.info("[AgentSession] send completed"',
    );
    expect(centerPanelSource).not.toContain(
      'console.info("[AgentSession] submit previous message"',
    );
    expect(centerPanelSource).not.toContain(
      'console.info("[AgentSession] submit previous message completed"',
    );
  });

  it("does not emit routine session title diagnostics directly to console", () => {
    expect(centerPanelSource).not.toContain('console.debug("[SessionTitle]');
  });

  it("keeps distinct error log prefixes for agent session sends", () => {
    expect(centerPanelSource).toContain(
      'console.error("[AgentSession] start session send failed"',
    );
    expect(centerPanelSource).toContain(
      'console.error("[AgentSession] send failed"',
    );
    expect(centerPanelSource).toContain(
      'console.error("[AgentSession] submit previous message failed"',
    );

    expect(centerPanelSource).not.toContain(
      'console.info("[Chat] start session send"',
    );
    expect(centerPanelSource).not.toContain(
      'console.info("[Chat] start session send completed"',
    );
    expect(centerPanelSource).not.toContain(
      'console.error("[Chat] start session send failed"',
    );
    expect(centerPanelSource).not.toContain('console.info("[Chat] send start"');
    expect(centerPanelSource).not.toContain(
      'console.info("[Chat] send completed"',
    );
    expect(centerPanelSource).not.toContain(
      'console.error("[Chat] send failed"',
    );
    expect(centerPanelSource).not.toContain(
      'console.info("[Chat] submit previous message"',
    );
    expect(centerPanelSource).not.toContain(
      'console.info("[Chat] submit previous message completed"',
    );
    expect(centerPanelSource).not.toContain(
      'console.error("[Chat] submit previous message failed"',
    );
  });

  it("keeps pure chat conversation logs under the chat prefix", () => {
    expect(centerPanelSource).toContain(
      'console.error("[Chat] start conversation failed"',
    );
  });

  it("refines a new agent session title after sending the message", () => {
    const startSessionSource = centerPanelSource.slice(
      centerPanelSource.indexOf("const handleStartSession"),
      centerPanelSource.indexOf("const handleSelectCollaborationMode"),
    );

    expect(
      startSessionSource.indexOf("refineAutoSessionTitle("),
    ).toBeGreaterThan(
      startSessionSource.indexOf("await desktopApi.sendMessage("),
    );
  });
});
