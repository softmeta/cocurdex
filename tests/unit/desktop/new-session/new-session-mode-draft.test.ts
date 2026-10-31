import type { AgentSessionMode } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { resolveNewSessionModeId } from "@/features/new-session/new-session-mode-draft";

const devinModes: AgentSessionMode[] = [
  { id: "accept-edits", name: "Code", description: null },
  { id: "smart", name: "Smart", description: null },
];

describe("resolveNewSessionModeId", () => {
  it("returns null when no draft mode is selected", () => {
    expect(resolveNewSessionModeId(null, devinModes, "acp")).toBeNull();
    expect(resolveNewSessionModeId("", devinModes, "acp")).toBeNull();
  });

  it("keeps a draft mode the agent advertises", () => {
    expect(resolveNewSessionModeId("smart", devinModes, "acp")).toBe("smart");
  });

  it("drops a draft mode the agent does not advertise", () => {
    expect(resolveNewSessionModeId("nope", devinModes, "acp")).toBeNull();
  });

  it("keeps the draft while an ACP agent's mode list is still undiscovered", () => {
    expect(resolveNewSessionModeId("smart", [], "acp")).toBe("smart");
  });

  it("drops the draft for native agents without a mode axis", () => {
    expect(resolveNewSessionModeId("smart", [], "native")).toBeNull();
    expect(resolveNewSessionModeId("smart", [], undefined)).toBeNull();
  });
});
