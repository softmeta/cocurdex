import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appShellEventsSource = readFileSync(
  resolve(__dirname, "../../app/layout/app-shell/app-shell-events.ts"),
  "utf8",
);

describe("app shell event logging", () => {
  it("does not emit high-volume agent event traces", () => {
    expect(appShellEventsSource).not.toContain(
      'console.info("[AgentEvent] received"',
    );
    expect(appShellEventsSource).not.toContain(
      'console.debug("[AgentEvent] received"',
    );
    expect(appShellEventsSource).not.toContain("deltaPreview");
    expect(appShellEventsSource).not.toContain("messagePreview");
  });

  it("does not emit routine agent lifecycle logs", () => {
    expect(appShellEventsSource).not.toContain(
      'console.info("[AgentEvent] state changed"',
    );
    expect(appShellEventsSource).not.toContain(
      'console.info("[AgentEvent] tool started"',
    );
    expect(appShellEventsSource).not.toContain(
      'console.info("[AgentEvent] tool finished"',
    );
  });

  it("keeps agent error logs", () => {
    expect(appShellEventsSource).toContain(
      'console.error("[AgentEvent] error"',
    );
  });
});
