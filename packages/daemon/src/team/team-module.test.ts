import type { TeamRepository } from "@cocurdex/db";
import type {
  AgentRoleRecord,
  SendSessionCommand,
  SessionRecord,
  TeamChangedEvent,
  TeamMemberRecord,
  TeamRecord,
  TeamTaskRecord,
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
    sessionModeId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastMessageAt: null,
    ...overrides,
  };
}

function memoryRepository(): TeamRepository {
  const teams = new Map<string, TeamRecord>();
  const members = new Map<string, TeamMemberRecord>();
  const tasks = new Map<string, TeamTaskRecord>();
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
    async failActiveMembers() {},
    async listTasks(teamId) {
      return [...tasks.values()].filter((task) => task.teamId === teamId);
    },
    async insertTask(task) {
      tasks.set(task.id, task);
    },
    async updateTask(task, expectedRevision) {
      if (tasks.get(task.id)?.revision !== expectedRevision) return false;
      tasks.set(task.id, { ...task, revision: expectedRevision + 1 });
      return true;
    },
  };
}

const role: AgentRoleRecord = {
  id: "role-1",
  name: "Reviewer",
  agentId: "claude-agent",
  providerId: null,
  modelId: "sonnet",
  modelName: "Sonnet",
  permissionMode: null,
  sessionModeId: null,
  reasoningEffort: null,
  serviceTier: null,
  fastMode: null,
  thinkingLevel: null,
  openCodeAgent: null,
  openCodeVariant: null,
  description: null,
  instructions: null,
  skillIds: null,
  avatar: null,
  createdAt: "",
  updatedAt: "",
};

const testerRole: AgentRoleRecord = {
  ...role,
  id: "role-2",
  name: "测试员",
  agentId: "codex",
  modelId: null,
  modelName: null,
};

const leadRole: AgentRoleRecord = {
  ...testerRole,
  id: "role-lead",
  name: "Lead",
};

const roles = new Map([
  [role.id, role],
  [testerRole.id, testerRole],
  [leadRole.id, leadRole],
]);

const squadMembers = [
  { agentRoleId: "role-lead", prompt: "Own the merge." },
  { agentRoleId: "role-1", prompt: "Review PRs." },
  { agentRoleId: "role-2", prompt: "Write tests." },
];

const pairMembers = [
  { agentRoleId: "role-lead", prompt: "" },
  { agentRoleId: "role-1", prompt: "go" },
];

function harness({ busy = new Set<string>() } = {}) {
  const settings = new Map<string, string>();
  const sessions = new Map<string, SessionRecord>([
    ["lead", session({ id: "lead" })],
  ]);
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
    getAgentRole: async (id) => roles.get(id) ?? null,
    listAgentRoles: async () => [role],
    getSetting: async (key) => settings.get(key) ?? null,
    setSetting: async (key, value) => {
      settings.set(key, value);
    },
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
    isSessionBusy: (id) => busy.has(id),
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
  return { module, sessions, sent, reports, stopped, events, settings };
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
      origin: { kind: "peer", sessionId: "lead" },
      sessionId: member.sessionId,
      delivery: "start-new-run",
    });
    expect(sent[0]?.content).toContain('teammate "alpha"');
    expect(sent[0]?.content).toContain("Review the auth module");
    expect(events[0]).toMatchObject({ type: "team.changed" });
    const snapshot = await module.get("lead");
    expect(snapshot?.members).toHaveLength(1);
  });

  it("titles the teammate session with its display title, keeping the name as identifier", async () => {
    const { module, sessions } = harness();
    const titled = await module.spawn("lead", {
      name: "alpha",
      title: " 认证审查 ",
      prompt: "go",
    });
    const blank = await module.spawn("lead", {
      name: "beta",
      title: "  ",
      prompt: "go",
    });
    expect(titled.name).toBe("alpha");
    expect(sessions.get(titled.sessionId)?.title).toBe("认证审查");
    expect(sessions.get(blank.sessionId)?.title).toBe("beta");
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

  it("tells the lead once per turn when a teammate waits on the user", async () => {
    const { module, reports } = harness();
    const member = await module.spawn("lead", { name: "alpha", prompt: "go" });
    const permission = (id: string) => ({
      type: "permission.requested" as const,
      sessionId: member.sessionId,
      request: {
        id,
        sessionId: member.sessionId,
        providerId: "codex" as const,
        kind: "execute",
        title: `Run ${id}`,
        locations: [],
        options: [],
        status: "pending" as const,
        createdAt: "",
        updatedAt: "",
      },
    });
    await module.onAgentEvent({
      type: "state.changed",
      sessionId: member.sessionId,
      status: "running",
    });
    await module.onAgentEvent(permission("first"));
    await module.onAgentEvent(permission("second"));
    expect(reports).toEqual([
      {
        to: "lead",
        content: expect.stringMatching(
          /^\[Teammate "alpha" is waiting for the user\]\nRun first/,
        ),
      },
    ]);

    await module.onAgentEvent({
      type: "turn.completed",
      sessionId: member.sessionId,
      messageId: "m-final",
      durationMs: 1,
      completedAt: "",
    });
    await module.onAgentEvent({
      type: "state.changed",
      sessionId: member.sessionId,
      status: "running",
    });
    await module.onAgentEvent({
      type: "question.requested",
      sessionId: member.sessionId,
      question: {
        id: "q",
        sessionId: member.sessionId,
        providerId: "codex",
        question: "Which branch?",
        status: "pending",
        createdAt: "",
        updatedAt: "",
      },
    });
    expect(reports.at(-1)?.content).toMatch(
      /^\[Teammate "alpha" is waiting for the user\]\nWhich branch\?/,
    );
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

  it("saves templates and spawns every member from one", async () => {
    const { module, sessions, sent } = harness();
    expect(await module.listRoles()).toEqual([
      {
        id: "role-1",
        name: "Reviewer",
        description: null,
        agentType: "claude-agent",
        model: "Sonnet",
        permissionMode: null,
      },
    ]);
    await expect(
      module.saveTemplate({ name: "Bad", members: [] }),
    ).rejects.toMatchObject({ code: "invalid_template" });
    const template = await module.saveTemplate({
      name: "Review squad",
      members: squadMembers,
    });
    expect(await module.listTemplates()).toEqual([template]);
    const renamed = await module.saveTemplate({ ...template, name: "Squad" });
    expect(renamed.id).toBe(template.id);
    expect((await module.listTemplates()).map((item) => item.name)).toEqual([
      "Squad",
    ]);

    const members = await module.spawnTemplate("lead", {
      templateId: template.id,
      prompt: "Focus on the auth module.",
    });
    expect(members.map((member) => member.name)).toEqual([
      "Reviewer",
      "测试员",
    ]);
    expect(sessions.get(members[0]?.sessionId ?? "")?.agentType).toBe(
      "claude-agent",
    );
    expect(sent[0]?.content).toContain(
      "Review PRs.\n\nFocus on the auth module.",
    );

    await module.deleteTemplate(template.id);
    expect(await module.listTemplates()).toEqual([]);
    await expect(
      module.spawnTemplate("lead", { templateId: template.id }),
    ).rejects.toMatchObject({ code: "template_not_found" });
  });

  it("binds a template roster to the lead without spawning anyone", async () => {
    const { module, sent, events } = harness();
    const template = await module.saveTemplate({
      name: "Review squad",
      description: "Reviews and tests changes",
      members: squadMembers,
    });

    const team = await module.create({
      leadSessionId: "lead",
      templateId: template.id,
    });

    expect(team.roster).toEqual({
      templateId: template.id,
      name: "Review squad",
      description: "Reviews and tests changes",
      leadPrompt: "Own the merge.",
      members: [
        { name: "Reviewer", agentRoleId: "role-1", prompt: "Review PRs." },
        { name: "测试员", agentRoleId: "role-2", prompt: "Write tests." },
      ],
    });
    expect((await module.get("lead"))?.members).toEqual([]);
    expect(sent).toEqual([]);
    expect(events).toEqual([
      { type: "team.changed", teamId: team.id, leadSessionId: "lead" },
    ]);
    expect(await module.rosterForLead("lead")).toEqual(team.roster);
    await expect(
      module.create({ leadSessionId: "lead", templateId: template.id }),
    ).rejects.toMatchObject({ code: "team_exists" });
    await expect(
      module.spawnTemplate("lead", { templateId: template.id }),
    ).rejects.toMatchObject({ code: "team_exists" });
  });

  it("rejects a roster from a missing template", async () => {
    const { module } = harness();
    await expect(
      module.create({ leadSessionId: "lead", templateId: "missing" }),
    ).rejects.toMatchObject({ code: "template_not_found" });
    expect(await module.get("lead")).toBeNull();
  });

  it("spawns only roster members and applies their role and standing instructions", async () => {
    const { module, sessions, sent } = harness();
    const template = await module.saveTemplate({
      name: "Review squad",
      members: squadMembers,
    });
    await module.create({ leadSessionId: "lead", templateId: template.id });

    await expect(
      module.spawn("lead", { name: "stranger", prompt: "Help out" }),
    ).rejects.toMatchObject({
      code: "not_in_roster",
      message: expect.stringContaining("Reviewer, 测试员"),
    });
    await expect(
      module.spawn("lead", {
        name: "测试员",
        prompt: "Cover task 1",
        agentRoleId: "role-1",
      }),
    ).rejects.toMatchObject({ code: "roster_fixes_agent" });

    const member = await module.spawn("lead", {
      name: "Reviewer",
      prompt: "Own task 1: review the auth module.",
    });

    expect(member.agentRoleId).toBe("role-1");
    expect(sessions.get(member.sessionId)?.agentType).toBe("claude-agent");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.content).toContain(
      "Review PRs.\n\nOwn task 1: review the auth module.",
    );
    expect((await module.get("lead"))?.members.map((m) => m.name)).toEqual([
      "Reviewer",
    ]);
  });

  it("keeps the lead out of the roster and rejects a team without teammates", async () => {
    const { module } = harness();
    await expect(
      module.saveTemplate({
        name: "Solo",
        members: [{ agentRoleId: "role-lead", prompt: "" }],
      }),
    ).rejects.toMatchObject({ code: "invalid_template" });
    const template = await module.saveTemplate({
      name: "Pair",
      members: pairMembers,
    });

    const team = await module.create({
      leadSessionId: "lead",
      templateId: template.id,
    });

    expect(team.roster?.members.map((member) => member.name)).toEqual([
      "Reviewer",
    ]);
  });

  it("reads templates saved before description and avatar existed", async () => {
    const { module, settings } = harness();
    settings.set(
      "teamTemplates",
      JSON.stringify([
        {
          id: "legacy",
          name: "Legacy",
          members: pairMembers,
          createdAt: "",
          updatedAt: "",
        },
      ]),
    );
    expect(await module.listTemplates()).toMatchObject([
      { id: "legacy", description: null, avatar: null, members: pairMembers },
    ]);
  });

  it("makes every member a distinct saved role", async () => {
    const { module, settings } = harness();
    settings.set(
      "teamTemplates",
      JSON.stringify([
        {
          id: "roleless",
          name: "Roleless",
          members: [{ name: "a", agentRoleId: null, prompt: "go" }],
          createdAt: "",
          updatedAt: "",
        },
      ]),
    );
    expect(await module.listTemplates()).toEqual([]);
    for (const members of [
      [
        { agentRoleId: "role-lead", prompt: "" },
        { agentRoleId: "missing", prompt: "go" },
      ],
      [
        { agentRoleId: "role-lead", prompt: "" },
        { agentRoleId: "role-1", prompt: "go" },
        { agentRoleId: "role-1", prompt: "again" },
      ],
    ]) {
      await expect(
        module.saveTemplate({ name: "Squad", members }),
      ).rejects.toMatchObject({ code: "invalid_template" });
    }
  });

  it("stores a trimmed description and a normalized avatar", async () => {
    const { module } = harness();
    const template = await module.saveTemplate({
      name: "Squad",
      description: "  Reviews pull requests  ",
      avatar: { kind: "emoji", emoji: " 🦊 ", color: "teal" },
      members: pairMembers,
    });
    expect(template).toMatchObject({
      description: "Reviews pull requests",
      avatar: { kind: "emoji", emoji: "🦊", color: "teal" },
    });
    const cleared = await module.saveTemplate({
      ...template,
      description: "   ",
      avatar: null,
    });
    expect(cleared).toMatchObject({ description: null, avatar: null });
  });

  it("lets only one session claim a task", async () => {
    const { module } = harness();
    const a = await module.spawn("lead", { name: "a", prompt: "go" });
    const b = await module.spawn("lead", { name: "b", prompt: "go" });
    const task = await module.taskCreate("lead", { title: "Audit" });
    expect(await module.taskList(a.sessionId)).toHaveLength(1);
    const claimed = await module.taskUpdate(a.sessionId, {
      taskId: task.id,
      status: "doing",
      assignee: "me",
    });
    expect(claimed).toMatchObject({
      status: "doing",
      assigneeSessionId: a.sessionId,
    });
    await expect(
      module.taskUpdate(b.sessionId, { taskId: task.id, assignee: "me" }),
    ).rejects.toMatchObject({ code: "TASK_CONFLICT" });
    await expect(
      module.taskUpdate(a.sessionId, { taskId: "nope", status: "done" }),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
  });

  it("rejects a concurrent claim of the same task", async () => {
    const { module } = harness();
    const a = await module.spawn("lead", { name: "a", prompt: "go" });
    const b = await module.spawn("lead", { name: "b", prompt: "go" });
    const task = await module.taskCreate("lead", { title: "Audit" });
    const results = await Promise.allSettled(
      [a, b].map((member) =>
        module.taskUpdate(member.sessionId, {
          taskId: task.id,
          status: "doing",
          assignee: "me",
        }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
  });

  it("runs dependent tasks in order and requires an independent review", async () => {
    const { module } = harness();
    const builder = await module.spawn("lead", {
      name: "builder",
      prompt: "go",
    });
    const design = await module.taskCreate("lead", { title: "Design" });
    const build = await module.taskCreate("lead", {
      title: "Build",
      blockedBy: [design.id],
    });
    expect(
      (await module.taskList(builder.sessionId)).find(
        (task) => task.id === build.id,
      ),
    ).toMatchObject({ blockedBy: [design.id], blocked: true });
    await expect(
      module.taskUpdate(builder.sessionId, {
        taskId: build.id,
        status: "doing",
        assignee: "me",
      }),
    ).rejects.toMatchObject({ code: "TASK_BLOCKED" });

    await module.taskUpdate(builder.sessionId, {
      taskId: design.id,
      status: "doing",
      assignee: "me",
    });
    await expect(
      module.taskUpdate(builder.sessionId, {
        taskId: design.id,
        status: "review",
      }),
    ).rejects.toMatchObject({ code: "EVIDENCE_REQUIRED" });
    const reviewed = await module.taskUpdate(builder.sessionId, {
      taskId: design.id,
      status: "review",
      evidence: "docs/design.md written; lint clean",
    });
    expect(reviewed).toMatchObject({
      status: "review",
      evidence: "docs/design.md written; lint clean",
    });
    await expect(
      module.taskUpdate(builder.sessionId, {
        taskId: design.id,
        status: "done",
      }),
    ).rejects.toMatchObject({ code: "SELF_APPROVAL" });
    await module.taskUpdate("lead", { taskId: design.id, status: "done" });

    expect(
      await module.taskUpdate(builder.sessionId, {
        taskId: build.id,
        status: "doing",
        assignee: "me",
      }),
    ).toMatchObject({ status: "doing", blocked: false });
  });

  it("rejects dependencies on tasks outside the team", async () => {
    const { module } = harness();
    await expect(
      module.taskCreate("lead", { title: "Build", blockedBy: ["missing"] }),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
  });

  it("lets a lead plan tasks before spawning, then reuses that team", async () => {
    const { module } = harness();
    expect(await module.taskList("lead")).toEqual([]);
    const task = await module.taskCreate("lead", { title: "Plan" });
    const member = await module.spawn("lead", { name: "a", prompt: "go" });
    const tasks = await module.taskList(member.sessionId);
    expect(tasks.map((item) => item.id)).toEqual([task.id]);
  });

  it("stops only the caller's own team", async () => {
    const { module } = harness();
    await expect(module.stopLeadTeam("lead")).rejects.toMatchObject({
      code: "team_not_found",
    });
    const member = await module.spawn("lead", { name: "a", prompt: "go" });
    await expect(
      module.stopLeadMember(member.sessionId, member.sessionId),
    ).rejects.toMatchObject({ code: "team_not_found" });
    const team = await module.stopLeadTeam("lead");
    expect(team.status).toBe("stopped");
  });

  it("refuses a lead stop while a teammate is busy unless forced", async () => {
    const busy = new Set<string>();
    const { module, stopped } = harness({ busy });
    const member = await module.spawn("lead", { name: "alpha", prompt: "go" });
    busy.add(member.sessionId);

    await expect(module.stopLeadTeam("lead")).rejects.toMatchObject({
      code: "members_busy",
    });
    await expect(
      module.stopLeadMember("lead", member.sessionId),
    ).rejects.toMatchObject({ code: "members_busy" });
    expect(stopped).toEqual([]);

    const team = await module.stopLeadTeam("lead", { force: true });
    expect(team.status).toBe("stopped");
    expect(stopped).toEqual([member.sessionId]);
  });

  it("keeps OpenCode out of agent teams", async () => {
    const { module, sessions } = harness();
    sessions.set("oc-lead", session({ id: "oc-lead", agentType: "opencode" }));
    await expect(
      module.spawn("oc-lead", { name: "a", prompt: "go" }),
    ).rejects.toMatchObject({ code: "unsupported_agent" });
    await expect(
      module.spawn("lead", { name: "a", prompt: "go", agentType: "opencode" }),
    ).rejects.toMatchObject({ code: "unsupported_agent" });
    expect(await module.taskList("lead")).toEqual([]);
  });
});
