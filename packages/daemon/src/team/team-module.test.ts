import type { TeamRepository } from "@cocurdex/db";
import type {
  IssueRecord,
  SendSessionCommand,
  SessionRecord,
  TeamChangedEvent,
  TeamMemberRecord,
  TeamRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { TeamModule } from "./team-module";

function session(overrides: Partial<SessionRecord>): SessionRecord {
  return {
    id: "lead",
    workspaceId: "w-1",
    title: "Lead",
    agentType: "codex",
    status: "idle",
    writeMode: "native-write",
    collaborationMode: "default",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastMessageAt: null,
    ...overrides,
  };
}

function memoryRepository(): TeamRepository {
  const teams = new Map<string, TeamRecord>();
  const members = new Map<string, TeamMemberRecord>();
  const snapshot = (team: TeamRecord | undefined) =>
    team
      ? {
          team,
          members: [...members.values()].filter((m) => m.teamId === team.id),
        }
      : null;
  return {
    async getById(teamId) {
      return snapshot(teams.get(teamId));
    },
    async getByLead(leadSessionId) {
      return snapshot(
        [...teams.values()].find((t) => t.leadSessionId === leadSessionId),
      );
    },
    async findBySession(sessionId) {
      const member = [...members.values()].find(
        (m) => m.sessionId === sessionId,
      );
      return snapshot(
        member
          ? teams.get(member.teamId)
          : [...teams.values()].find((t) => t.leadSessionId === sessionId),
      );
    },
    async saveTeam(team) {
      teams.set(team.id, team);
    },
    async saveMember(member) {
      members.set(`${member.teamId}:${member.sessionId}`, member);
    },
  };
}

function harness() {
  const sessions = new Map<string, SessionRecord>([
    ["lead", session({ id: "lead" })],
  ]);
  const issues = new Map<string, IssueRecord>();
  const sent: SendSessionCommand[] = [];
  const reports: { to: string; content: string }[] = [];
  const stopped: string[] = [];
  const events: TeamChangedEvent[] = [];
  let ids = 0;
  const module = new TeamModule({
    repository: memoryRepository(),
    getSession: async (id) => sessions.get(id) ?? null,
    saveSession: async (record) => {
      sessions.set(record.id, record);
    },
    getAgentRole: async () => null,
    createIssueView: async ({ title }) => ({
      id: `view:${title}`,
      title,
      icon: null,
      groupBy: "status",
      layout: "board",
      filters: [],
      revision: 1,
    }),
    loadIssueView: async (viewId) => ({
      view: {
        id: viewId,
        title: viewId,
        icon: null,
        groupBy: "status",
        layout: "board",
        filters: [],
        revision: 1,
        createdAt: "",
        updatedAt: "",
      },
      columns: [],
      statusOptions: [],
      priorityOptions: [],
      issues: [...issues.values()].filter((issue) => issue.viewId === viewId),
    }),
    createIssue: async (payload) => {
      const issue: IssueRecord = {
        id: `issue-${issues.size + 1}`,
        columnId: payload.columnId,
        viewId: payload.viewId,
        title: payload.title ?? "",
        description: payload.description ?? null,
        color: null,
        status: payload.columnId,
        priority: "none",
        workspaceId: payload.workspaceId ?? null,
        assigneeSessionId: null,
        sortOrder: 0,
        revision: 1,
        createdAt: "",
        updatedAt: "",
      };
      issues.set(issue.id, issue);
      return issue;
    },
    updateIssue: async (payload) => {
      const current = issues.get(payload.id);
      if (!current) throw new Error("missing");
      if (
        payload.expectedRevision !== undefined &&
        payload.expectedRevision !== current.revision
      ) {
        throw Object.assign(new Error("conflict"), { conflict: true });
      }
      const next: IssueRecord = {
        ...current,
        status: payload.status ?? current.status,
        assigneeSessionId:
          payload.assigneeSessionId !== undefined
            ? payload.assigneeSessionId
            : current.assigneeSessionId,
        revision: current.revision + 1,
      };
      issues.set(next.id, next);
      return next;
    },
    isIssueConflict: (error) =>
      typeof error === "object" && error !== null && "conflict" in error,
    sendSessionMessage: async (command) => {
      sent.push(command);
      return {
        id: `m-${sent.length}`,
        sessionId: command.sessionId,
        role: "user",
        content: command.content,
        attachments: [],
        createdAt: "",
      };
    },
    sendPeerMessage: async (payload, render) => {
      reports.push({
        to: payload.toSessionId,
        content: render(null, payload.content),
      });
      return { messageId: "r", delivery: "start-new-run" };
    },
    stopSession: async (id) => {
      stopped.push(id);
    },
    getMessage: async (id) => ({
      id,
      sessionId: "x",
      role: "assistant",
      content: "final answer",
      attachments: [],
      createdAt: "",
    }),
    broadcast: (event) => events.push(event),
    now: () => "2026-01-02T00:00:00.000Z",
    createId: () => `id-${++ids}`,
  });
  return { module, sessions, sent, reports, stopped, events };
}

describe("TeamModule", () => {
  it("spawns a teammate session under the lead and briefs it", async () => {
    const { module, sessions, sent, events } = harness();
    const member = await module.spawn("lead", {
      name: "alpha",
      prompt: "Review the auth module",
    });
    expect(member).toMatchObject({ name: "alpha", status: "spawning" });
    const teammate = sessions.get(member.sessionId);
    expect(teammate).toMatchObject({
      sessionKind: "teammate",
      parentSessionId: "lead",
      title: "alpha",
      agentType: "codex",
    });
    expect(sent[0]).toMatchObject({
      sessionId: member.sessionId,
      delivery: "start-new-run",
    });
    expect(sent[0]?.content).toContain('teammate "alpha"');
    expect(sent[0]?.content).toContain("Review the auth module");
    expect(events[0]).toMatchObject({ type: "team.changed" });
    const snapshot = await module.get("lead");
    expect(snapshot?.team.issueViewId).toBe("view:team:lead");
    expect(snapshot?.members).toHaveLength(1);
  });

  it("rejects nested teams and duplicate names", async () => {
    const { module } = harness();
    const member = await module.spawn("lead", { name: "alpha", prompt: "go" });
    await expect(
      module.spawn("lead", { name: "alpha", prompt: "again" }),
    ).rejects.toMatchObject({ code: "duplicate_name" });
    await expect(
      module.spawn(member.sessionId, { name: "beta", prompt: "nested" }),
    ).rejects.toMatchObject({ code: "lead_not_main" });
  });

  it("reports teammate turns to the lead and tracks member status", async () => {
    const { module, reports } = harness();
    const member = await module.spawn("lead", { name: "alpha", prompt: "go" });
    await module.onAgentEvent({
      type: "state.changed",
      sessionId: member.sessionId,
      status: "running",
    });
    expect((await module.get("lead"))?.members[0]?.status).toBe("running");
    await module.onAgentEvent({
      type: "turn.completed",
      sessionId: member.sessionId,
      messageId: "m-final",
      durationMs: 1,
      completedAt: "",
    });
    expect((await module.get("lead"))?.members[0]?.status).toBe("idle");
    expect(reports).toEqual([
      { to: "lead", content: '[Teammate "alpha" finished]\nfinal answer' },
    ]);
  });

  it("cascades a lead stop to every member and blocks further spawns", async () => {
    const { module, stopped } = harness();
    const a = await module.spawn("lead", { name: "a", prompt: "go" });
    const b = await module.spawn("lead", { name: "b", prompt: "go" });
    await module.onLeadStopped("lead");
    expect(stopped.sort()).toEqual([a.sessionId, b.sessionId].sort());
    const snapshot = await module.get("lead");
    expect(snapshot?.team.status).toBe("stopped");
    expect(snapshot?.members.map((m) => m.status)).toEqual([
      "stopped",
      "stopped",
    ]);
    await expect(
      module.spawn("lead", { name: "c", prompt: "go" }),
    ).rejects.toMatchObject({ code: "team_stopped" });
  });

  it("scopes teammate peers to the team and leaves the lead unscoped", async () => {
    const { module } = harness();
    const a = await module.spawn("lead", { name: "a", prompt: "go" });
    const b = await module.spawn("lead", { name: "b", prompt: "go" });
    expect(await module.peerScope("lead")).toBeNull();
    expect([...((await module.peerScope(a.sessionId)) ?? [])].sort()).toEqual(
      ["lead", a.sessionId, b.sessionId].sort(),
    );
  });

  it("lets only one session claim a task", async () => {
    const { module } = harness();
    const a = await module.spawn("lead", { name: "a", prompt: "go" });
    const b = await module.spawn("lead", { name: "b", prompt: "go" });
    const task = await module.taskCreate("lead", { title: "Audit" });
    expect(await module.taskList(a.sessionId)).toHaveLength(1);
    const claimed = await module.taskUpdate(a.sessionId, {
      issueId: task.id,
      status: "doing",
      assignee: "me",
    });
    expect(claimed).toMatchObject({
      status: "doing",
      assigneeSessionId: a.sessionId,
    });
    await expect(
      module.taskUpdate(b.sessionId, { issueId: task.id, assignee: "me" }),
    ).rejects.toMatchObject({ code: "TASK_CONFLICT" });
    await expect(
      module.taskUpdate(a.sessionId, { issueId: "nope", status: "done" }),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
  });
});
