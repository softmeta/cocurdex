import { describe, expect, it } from "vitest";
import {
  buildTeamRosterMembers,
  canSpawnTeammate,
  checkTeamTaskUpdate,
  normalizeTeamTemplateMembers,
  TEAM_MAX_MEMBERS,
  type TeamMemberRecord,
  transitionTeamMember,
} from "./team";

const member: TeamMemberRecord = {
  teamId: "t",
  sessionId: "s",
  name: "alpha",
  agentRoleId: null,
  status: "spawning",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const now = "2026-01-02T00:00:00.000Z";

describe("transitionTeamMember", () => {
  it("walks spawning -> running -> idle -> running -> error", () => {
    const running = transitionTeamMember(member, { type: "turn.started" }, now);
    expect(running.status).toBe("running");
    expect(running.updatedAt).toBe(now);
    const idle = transitionTeamMember(running, { type: "turn.completed" }, now);
    expect(idle.status).toBe("idle");
    const again = transitionTeamMember(idle, { type: "turn.started" }, now);
    expect(again.status).toBe("running");
    expect(
      transitionTeamMember(again, { type: "turn.failed" }, now).status,
    ).toBe("error");
  });

  it("treats stopped as terminal", () => {
    const stopped = transitionTeamMember(member, { type: "stopped" }, now);
    expect(stopped.status).toBe("stopped");
    expect(transitionTeamMember(stopped, { type: "turn.started" }, now)).toBe(
      stopped,
    );
  });

  it("returns the same record when the status does not change", () => {
    expect(
      transitionTeamMember(member, { type: "turn.started" }, now),
    ).not.toBe(member);
    const running = { ...member, status: "running" as const };
    expect(transitionTeamMember(running, { type: "turn.started" }, now)).toBe(
      running,
    );
  });
});

describe("canSpawnTeammate", () => {
  const active = { status: "active" as const };

  it("accepts a fresh team", () => {
    expect(canSpawnTeammate(null, [], { name: "alpha" })).toEqual({ ok: true });
  });

  it("rejects a stopped team", () => {
    expect(
      canSpawnTeammate({ status: "stopped" }, [], { name: "alpha" }),
    ).toEqual({ ok: false, reason: "team_stopped" });
  });

  it("rejects invalid names", () => {
    for (const name of ["", "Alpha", "-a", "a b", "a".repeat(33)]) {
      expect(canSpawnTeammate(active, [], { name })).toEqual({
        ok: false,
        reason: "invalid_name",
      });
    }
  });

  it("rejects duplicates and the member limit", () => {
    expect(canSpawnTeammate(active, [member], { name: "alpha" })).toEqual({
      ok: false,
      reason: "duplicate_name",
    });
    const full = Array.from({ length: TEAM_MAX_MEMBERS }, (_, index) => ({
      name: `m${index}`,
    }));
    expect(canSpawnTeammate(active, full, { name: "alpha" })).toEqual({
      ok: false,
      reason: "member_limit",
    });
  });
});

describe("canSpawnTeammate with a roster", () => {
  const rostered = {
    status: "active" as const,
    roster: {
      templateId: "tpl-1",
      name: "Squad",
      description: null,
      leadPrompt: "",
      members: [{ name: "reviewer", agentRoleId: "role-1", prompt: "Review." }],
    },
  };

  it("accepts a roster member", () => {
    expect(canSpawnTeammate(rostered, [], { name: "reviewer" })).toEqual({
      ok: true,
    });
  });

  it("rejects names outside the roster", () => {
    expect(canSpawnTeammate(rostered, [], { name: "stranger" })).toEqual({
      ok: false,
      reason: "not_in_roster",
    });
  });

  it("rejects overriding the roster member's agent", () => {
    for (const override of [
      { agentRoleId: "role-2" },
      { agentType: "codex" as const },
    ]) {
      expect(
        canSpawnTeammate(rostered, [], { name: "reviewer", ...override }),
      ).toEqual({ ok: false, reason: "roster_fixes_agent" });
    }
  });

  it("still rejects spawning a roster member twice", () => {
    expect(
      canSpawnTeammate(rostered, [{ name: "reviewer" }], { name: "reviewer" }),
    ).toEqual({ ok: false, reason: "duplicate_name" });
  });
});

describe("checkTeamTaskUpdate", () => {
  const task = { status: "backlog", assigneeSessionId: null };

  it("refuses to start a task while a blocker is unfinished", () => {
    const blockers = [{ status: "done" }, { status: "doing" }];
    expect(
      checkTeamTaskUpdate({
        task,
        blockers,
        callerSessionId: "a",
        update: { assignee: "me" },
      }),
    ).toEqual({ ok: false, reason: "TASK_BLOCKED" });
    expect(
      checkTeamTaskUpdate({
        task,
        blockers,
        callerSessionId: "a",
        update: { status: "doing" },
      }),
    ).toEqual({ ok: false, reason: "TASK_BLOCKED" });
  });

  it("allows starting once every blocker is done", () => {
    expect(
      checkTeamTaskUpdate({
        task,
        blockers: [{ status: "done" }],
        callerSessionId: "a",
        update: { status: "doing", assignee: "me" },
      }),
    ).toEqual({ ok: true });
  });

  it("requires evidence to submit for review", () => {
    const doing = { status: "doing", assigneeSessionId: "a" };
    expect(
      checkTeamTaskUpdate({
        task: doing,
        blockers: [],
        callerSessionId: "a",
        update: { status: "review", evidence: "  " },
      }),
    ).toEqual({ ok: false, reason: "EVIDENCE_REQUIRED" });
    expect(
      checkTeamTaskUpdate({
        task: doing,
        blockers: [],
        callerSessionId: "a",
        update: { status: "review", evidence: "pnpm test: 12 passed" },
      }),
    ).toEqual({ ok: true });
  });

  it("only approves reviewed work, and never by its assignee", () => {
    expect(
      checkTeamTaskUpdate({
        task: { status: "doing", assigneeSessionId: "a" },
        blockers: [],
        callerSessionId: "lead",
        update: { status: "done" },
      }),
    ).toEqual({ ok: false, reason: "REVIEW_REQUIRED" });
    const inReview = { status: "review", assigneeSessionId: "a" };
    expect(
      checkTeamTaskUpdate({
        task: inReview,
        blockers: [],
        callerSessionId: "a",
        update: { status: "done" },
      }),
    ).toEqual({ ok: false, reason: "SELF_APPROVAL" });
    expect(
      checkTeamTaskUpdate({
        task: inReview,
        blockers: [],
        callerSessionId: "reviewer",
        update: { status: "done" },
      }),
    ).toEqual({ ok: true });
  });
});

describe("team template members", () => {
  it("keeps one member per saved role and drops roleless members", () => {
    expect(
      normalizeTeamTemplateMembers([
        { name: "legacy", agentRoleId: null, prompt: "go" },
        { agentRoleId: "role-1", prompt: "Review." },
        { agentRoleId: "role-1", prompt: "Again." },
        { agentRoleId: "role-2" },
      ]),
    ).toEqual([
      { agentRoleId: "role-1", prompt: "Review." },
      { agentRoleId: "role-2", prompt: "" },
    ]);
  });

  it("names roster members after their roles and keeps names unique", () => {
    const roles = new Map([
      ["role-1", { name: "审查员" }],
      ["role-2", { name: "审查员" }],
    ]);
    expect(
      buildTeamRosterMembers(
        [
          { agentRoleId: "role-1", prompt: "" },
          { agentRoleId: "role-2", prompt: "" },
        ],
        roles,
      )?.map((member) => member.name),
    ).toEqual(["审查员", "审查员 2"]);
    expect(
      buildTeamRosterMembers([{ agentRoleId: "gone", prompt: "" }], roles),
    ).toBeNull();
  });

  it("spawns a roster member by a role name that is not a slug", () => {
    const team = {
      status: "active" as const,
      roster: {
        templateId: "tpl-1",
        name: "Squad",
        description: null,
        leadPrompt: "",
        members: [{ name: "审查员", agentRoleId: "role-1", prompt: "" }],
      },
    };
    expect(canSpawnTeammate(team, [], { name: "审查员" })).toEqual({
      ok: true,
    });
    expect(canSpawnTeammate(null, [], { name: "审查员" })).toEqual({
      ok: false,
      reason: "invalid_name",
    });
  });
});
