import type { ApplicationPrincipalDependencies } from "@cocurdex/daemon/internal/application-principal";
import { resolveApplicationPrincipal } from "@cocurdex/daemon/internal/application-principal";
import { describe, expect, it } from "vitest";

function dependencies(): ApplicationPrincipalDependencies {
  return {
    getSession: async (id) => ({
      id,
      sessionKind: id === "home" ? "personal" : "main",
      parentSessionId:
        id === "child" ? "work" : id === "cycle" ? "cycle" : null,
    }),
    persona: (session) => (session.id === "home" ? "assistant-a" : null),
    delegation: (id) => (id === "work" ? "assistant-a" : null),
    teamLead: async (id) => (id === "teammate" ? "work" : null),
  };
}

describe("application caller identity", () => {
  it("separates direct assistant use from delegated work and its children and teammates", async () => {
    const deps = dependencies();
    expect(await resolveApplicationPrincipal("home", deps)).toEqual({
      personaId: "assistant-a",
      delegated: false,
    });
    for (const id of ["work", "child", "teammate"])
      expect(await resolveApplicationPrincipal(id, deps)).toEqual({
        personaId: "assistant-a",
        delegated: true,
      });
    for (const id of ["other", "cycle"])
      expect(await resolveApplicationPrincipal(id, deps)).toEqual({
        personaId: null,
        delegated: true,
      });
  });

  it("does not grant work access merely from an assistant parent or matching role", async () => {
    const deps = dependencies();
    deps.getSession = async (id) => ({
      id,
      agentRoleId: "personal-role",
      sessionKind: id === "home" ? "personal" : "main",
      parentSessionId: id === "unrelated" ? "home" : null,
    });
    expect(await resolveApplicationPrincipal("unrelated", deps)).toEqual({
      personaId: null,
      delegated: true,
    });
  });
});
