import { PersonalAgentService } from "@cocurdex/daemon/internal/personal/personal-agent-service";
import { type CocurdexDatabase, createCocurdexDatabase } from "@cocurdex/db";
import {
  type AgentRoleRecord,
  PERSONAL_WORKSPACE_ID,
  type PersonalAgentRolePayload,
  type SessionRecord,
} from "@cocurdex/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const now = "2026-11-05T00:00:00.000Z";

const coachRole: PersonalAgentRolePayload = {
  name: "Coach",
  agentId: "codex",
  providerId: null,
  modelId: null,
  modelName: null,
  permissionMode: null,
  sessionModeId: null,
  reasoningEffort: null,
  serviceTier: null,
  fastMode: null,
  thinkingLevel: null,
  openCodeAgent: null,
  openCodeVariant: null,
  instructions: "Plan workouts",
};

interface Harness {
  database: CocurdexDatabase;
  service: PersonalAgentService;
  failNextHomeSession: () => void;
  announcements: () => number;
}

async function createHarness(): Promise<Harness> {
  const database = createCocurdexDatabase(":memory:");
  await database.workspaces.upsert({
    id: PERSONAL_WORKSPACE_ID,
    name: "Personal",
    rootPaths: ["/personal"],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 0,
  });
  let failHome = false;
  let announced = 0;
  let nextId = 0;
  const service = new PersonalAgentService({
    repository: database.personalAgents,
    getRole: (id) => database.agentRoles.getById(id),
    async saveRole(payload) {
      const role: AgentRoleRecord = {
        description: null,
        instructions: null,
        skillIds: null,
        avatar: null,
        ...payload,
        id: payload.id ?? `role-${++nextId}`,
        createdAt: now,
        updatedAt: now,
      };
      await database.agentRoles.upsert(role);
      return role;
    },
    deleteRole: (id) => database.agentRoles.delete(id),
    async createHomeSession(role) {
      if (failHome) {
        failHome = false;
        throw new Error("agent unavailable");
      }
      const session: SessionRecord = {
        id: `session-${++nextId}`,
        workspaceId: PERSONAL_WORKSPACE_ID,
        title: role.name,
        agentType: role.agentId,
        sessionKind: "personal",
        agentRoleId: role.id,
        writeMode: "read-only",
        sessionModeId: null,
        status: "idle",
        createdAt: now,
        updatedAt: now,
        lastMessageAt: null,
      };
      await database.sessions.upsert(session);
      return session;
    },
    removeSession: (id) => database.sessions.delete(id),
    announceChanged: () => {
      announced += 1;
    },
    now: () => now,
  });
  return {
    database,
    service,
    failNextHomeSession: () => {
      failHome = true;
    },
    announcements: () => announced,
  };
}

describe("PersonalAgentService", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(() => {
    harness.database.close();
  });

  it("creates exactly one default agent even when asked concurrently", async () => {
    const [first, second] = await Promise.all([
      harness.service.ensureDefault({ name: "助理" }),
      harness.service.ensureDefault({ name: "助理" }),
    ]);
    const again = await harness.service.ensureDefault({ name: "Assistant" });

    expect(second.id).toBe(first.id);
    expect(again.id).toBe(first.id);
    expect(first).toMatchObject({ isDefault: true, role: { name: "助理" } });
    expect(await harness.service.list()).toHaveLength(1);
  });

  it("lists the default first, then pinned agents, then creation order", async () => {
    const coach = await harness.service.create({ role: coachRole });
    const writer = await harness.service.create({
      role: { ...coachRole, name: "Writer" },
    });
    await harness.service.update({ id: writer.id, pinned: true });
    const assistant = await harness.service.ensureDefault({ name: "助理" });

    const names = (await harness.service.list()).map((agent) => agent.id);
    expect(names).toEqual([assistant.id, writer.id, coach.id]);
  });

  it("rolls back the role when the home thread cannot be created", async () => {
    harness.failNextHomeSession();

    await expect(harness.service.create({ role: coachRole })).rejects.toThrow(
      "agent unavailable",
    );
    expect(await harness.database.agentRoles.list()).toEqual([]);
    expect(await harness.service.list()).toEqual([]);
  });

  it("updates role, soul, pin and mute without touching the home thread", async () => {
    const coach = await harness.service.create({ role: coachRole });

    const updated = await harness.service.update({
      id: coach.id,
      role: { ...coachRole, name: "Trainer" },
      soul: "  Speak briefly.  ",
      pinned: true,
      muted: true,
    });
    const unmuted = await harness.service.update({
      id: coach.id,
      muted: false,
    });

    expect(updated).toMatchObject({
      role: { id: coach.role.id, name: "Trainer" },
      soul: "Speak briefly.",
      pinnedAt: now,
      mutedAt: now,
      homeSessionId: coach.homeSessionId,
    });
    expect(unmuted).toMatchObject({ pinnedAt: now, mutedAt: null });
  });

  it("duplicates an agent with its own role and home thread", async () => {
    const coach = await harness.service.create({
      role: coachRole,
      soul: "Encouraging",
    });

    const copy = await harness.service.duplicate({
      id: coach.id,
      name: "Coach 2",
    });

    expect(copy.role.id).not.toBe(coach.role.id);
    expect(copy.homeSessionId).not.toBe(coach.homeSessionId);
    expect(copy).toMatchObject({
      isDefault: false,
      soul: "Encouraging",
      role: {
        name: "Coach 2",
        agentId: "codex",
        instructions: "Plan workouts",
      },
    });
  });

  it("deletes an agent with its role and home thread but keeps the default", async () => {
    const assistant = await harness.service.ensureDefault({ name: "助理" });
    const coach = await harness.service.create({ role: coachRole });

    await harness.service.delete(coach.id);

    expect(await harness.database.agentRoles.getById(coach.role.id)).toBeNull();
    expect(
      await harness.database.sessions.getById(coach.homeSessionId),
    ).toBeNull();
    await expect(harness.service.delete(assistant.id)).rejects.toThrow(
      "default personal agent",
    );
    expect(harness.service.ownsHomeSession(assistant.homeSessionId)).toBe(true);
    expect(harness.service.ownsRole(assistant.role.id)).toBe(true);
    expect(harness.announcements()).toBe(3);
  });
});
