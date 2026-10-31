import {
  chooseAgent,
  chooseModel,
  choosePermissionMode,
  chooseRole,
  chooseRuntime,
  chooseWorkspace,
  displayedChoices,
  displayedRuntime,
  draftWorkspaceId,
  EMPTY_DRAFT,
  workspaceChoices,
} from "@cocurdex/mobile/internal/new-session/new-session-draft";
import {
  CHAT_WORKSPACE_ID,
  type SessionRecord,
  type WorkspaceRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const now = "2026-10-25T00:00:00.000Z";

function workspace(id: string): WorkspaceRecord {
  return {
    id,
    name: id,
    rootPaths: [`/synthetic/${id}`],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 0,
  };
}

function session(
  id: string,
  workspaceId: string,
  lastMessageAt: string,
  extra: Partial<SessionRecord> = {},
): SessionRecord {
  return {
    id,
    workspaceId,
    title: id,
    agentType: "codex",
    status: "idle",
    writeMode: "read-only",
    sessionModeId: null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt,
    ...extra,
  };
}

describe("workspaceChoices", () => {
  it("lists project workspaces by latest activity with their session counts", () => {
    const choices = workspaceChoices(
      [
        workspace("docs"),
        workspace("shop"),
        workspace(CHAT_WORKSPACE_ID),
        workspace("tokens"),
      ],
      [
        session("a", "shop", "2026-10-24T10:00:00.000Z"),
        session("b", "shop", "2026-10-20T10:00:00.000Z"),
        session("c", "docs", "2026-10-22T10:00:00.000Z"),
        session("d", "docs", "2026-10-25T10:00:00.000Z", {
          archivedAt: now,
        }),
        session("e", "docs", "2026-10-25T11:00:00.000Z", {
          parentSessionId: "c",
        }),
      ],
    );

    expect(
      choices.map((choice) => [choice.workspace.id, choice.sessionCount]),
    ).toEqual([
      ["shop", 2],
      ["docs", 1],
      ["tokens", 0],
    ]);
    expect(draftWorkspaceId(EMPTY_DRAFT, choices)).toBe("shop");
    expect(
      draftWorkspaceId(chooseWorkspace(EMPTY_DRAFT, "docs"), choices),
    ).toBe("docs");
    expect(
      draftWorkspaceId(chooseWorkspace(EMPTY_DRAFT, "removed"), choices),
    ).toBe("shop");
  });
});

describe("draft choices", () => {
  it("drops the model and mode picked for another agent", () => {
    const draft = choosePermissionMode(
      chooseModel(chooseWorkspace(EMPTY_DRAFT, "shop"), "claude-agent", {
        providerId: "anthropic",
        modelId: "opus",
      }),
      "claude-agent",
      "claude-plan",
    );

    expect(chooseAgent(draft, "claude-agent")).toBe(draft);
    expect(chooseAgent(draft, "codex")).toEqual({
      workspaceId: "shop",
      agentType: "codex",
    });
  });

  it("lets the computer pick the mode again after a model change", () => {
    const draft = choosePermissionMode(
      chooseWorkspace(EMPTY_DRAFT, "shop"),
      "claude-agent",
      "claude-auto",
    );

    expect(
      chooseModel(draft, "claude-agent", {
        providerId: "anthropic",
        modelId: "haiku",
      }),
    ).toEqual({
      workspaceId: "shop",
      agentType: "claude-agent",
      model: { providerId: "anthropic", modelId: "haiku" },
    });
  });
});

describe("role choices", () => {
  const reviewer = { id: "role-reviewer", agentId: "claude-agent" as const };

  it("lets the computer apply the role's agent, model, and mode", () => {
    const draft = chooseModel(chooseWorkspace(EMPTY_DRAFT, "shop"), "codex", {
      providerId: "openai",
      modelId: "gpt",
    });

    expect(chooseRole(draft, reviewer)).toEqual({
      workspaceId: "shop",
      agentType: "claude-agent",
      roleId: "role-reviewer",
    });
  });

  it("keeps the role while its model or mode is adjusted", () => {
    const draft = chooseRole(chooseWorkspace(EMPTY_DRAFT, "shop"), reviewer);
    const adjusted = choosePermissionMode(
      chooseModel(draft, "claude-agent", {
        providerId: "anthropic",
        modelId: "haiku",
      }),
      "claude-agent",
      "claude-plan",
    );

    expect(adjusted).toMatchObject({ roleId: "role-reviewer" });
  });

  it("drops the role when an agent is picked directly", () => {
    const draft = chooseRole(chooseWorkspace(EMPTY_DRAFT, "shop"), reviewer);

    expect(chooseAgent(draft, "claude-agent")).toEqual({
      workspaceId: "shop",
      agentType: "claude-agent",
    });
  });
});

describe("displayedChoices", () => {
  const resolved = {
    agentType: "claude-agent" as const,
    model: { providerId: "anthropic", modelId: "opus" },
    permissionMode: "claude-default" as const,
    permissionModes: ["claude-default" as const, "claude-plan" as const],
  };

  it("marks a newly picked agent before the computer confirms it", () => {
    const shown = displayedChoices(
      { workspaceId: "w", agentType: "codex" },
      resolved,
    );
    expect(shown.agentType).toBe("codex");
    expect(shown.model).toBeNull();
    expect(shown.permissionMode).toBeNull();
    expect(shown.permissionModes).toEqual([]);
  });

  it("shows what the computer resolved once it matches the pick", () => {
    expect(displayedChoices({ workspaceId: "w" }, resolved)).toEqual({
      agentType: "claude-agent",
      model: resolved.model,
      permissionMode: "claude-default",
      permissionModes: resolved.permissionModes,
    });
    expect(
      displayedChoices(
        {
          workspaceId: "w",
          agentType: "claude-agent",
          permissionMode: "claude-plan",
        },
        resolved,
      ).permissionMode,
    ).toBe("claude-plan");
  });
});

describe("runtime options", () => {
  const reviewer = {
    id: "role-1",
    agentId: "codex" as const,
    reasoningEffort: "xhigh" as const,
    serviceTier: null,
    fastMode: null,
    thinkingLevel: null,
    openCodeAgent: null,
    openCodeVariant: null,
  };

  it("keeps runtime choices across a model change but drops them with the agent", () => {
    const draft = chooseRuntime(
      { workspaceId: "w1", agentType: "codex" },
      "codex",
      { reasoningEffort: "high" },
    );
    const remodeled = chooseModel(draft, "codex", {
      providerId: "openai",
      modelId: "gpt",
    });

    expect(remodeled.runtime).toEqual({ reasoningEffort: "high" });
    expect(chooseAgent(remodeled, "pi").runtime).toBeUndefined();
  });

  it("shows the role's runtime until the user overrides it", () => {
    const draft = chooseRole({ workspaceId: "w1" }, reviewer);

    expect(displayedRuntime(draft, "codex", reviewer).reasoningEffort).toBe(
      "xhigh",
    );
    expect(
      displayedRuntime(
        chooseRuntime(draft, "codex", { reasoningEffort: "low" }),
        "codex",
        reviewer,
      ).reasoningEffort,
    ).toBe("low");
    expect(displayedRuntime(draft, "pi", reviewer)).toEqual({});
  });
});
