import { describe, expect, it } from "vitest";
import {
  canSpawnTeammate,
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
