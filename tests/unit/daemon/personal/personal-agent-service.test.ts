import type { PersonaGreetingInput } from "@cocurdex/daemon/internal/personal/persona-greeting";
import { PersonalAgentService } from "@cocurdex/daemon/internal/personal/personal-agent-service";
import { type CocurdexDatabase, createCocurdexDatabase } from "@cocurdex/db";
import {
  type AgentRoleRecord,
  type CompatibleProviderModel,
  PERSONAL_WORKSPACE_ID,
  type PersonalAgentRolePayload,
  type SessionRecord,
} from "@cocurdex/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const now = "2026-11-05T00:00:00.000Z";

const coachRole: PersonalAgentRolePayload = {
  name: "Coach",
  agentId: "pi",
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
  greetings: { sessionId: string; content: string }[];
  models: CompatibleProviderModel[];
  writeGreeting: (
    write: (input: PersonaGreetingInput) => Promise<string | null>,
  ) => void;
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
  const greetings: Harness["greetings"] = [];
  const models: CompatibleProviderModel[] = [];
  let write: (input: PersonaGreetingInput) => Promise<string | null> =
    async () => null;
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
    listModels: async () => models,
    hasMessages: async (sessionId) =>
      greetings.some((greeting) => greeting.sessionId === sessionId),
    writeGreeting: (_sessionId, input) => write(input),
    greet: async (sessionId, content) => {
      greetings.push({ sessionId, content });
    },
    removeDependents: async () => {},
    applyRole: async () => {},
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
    greetings,
    models,
    writeGreeting: (next) => {
      write = next;
    },
  };
}

function compatible(
  providerId: string,
  modelId: string,
): CompatibleProviderModel {
  return {
    provider: {
      id: providerId,
      name: providerId,
      baseUrl: "https://llm.example.invalid/v1",
      enabled: true,
      apiKeySecretId: null,
      headersJson: null,
      createdAt: now,
      updatedAt: now,
    },
    model: {
      providerId,
      modelId,
      name: `${modelId} name`,
      api: "openai-completions",
      enabled: true,
      source: "manual",
      capabilities: ["chat", "agent"],
      createdAt: now,
      updatedAt: now,
    },
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

  it("starts empty and makes exactly the first assistant the default", async () => {
    expect(await harness.service.list()).toEqual([]);

    const [first, second] = await Promise.all([
      harness.service.create({ role: coachRole }),
      harness.service.create({ role: { ...coachRole, name: "Writer" } }),
    ]);

    expect([first.isDefault, second.isDefault]).toEqual([true, false]);
    expect(harness.greetings).toHaveLength(0);
  });

  it("greets once with the assistant's own words, however often it is asked", async () => {
    const agent = await harness.service.create({ role: coachRole });
    const written: PersonaGreetingInput[] = [];
    harness.writeGreeting(async (input) => {
      written.push(input);
      return "Hi, I'm Coach. Want a plan for this week?";
    });

    const results = await Promise.all([
      harness.service.greet({ id: agent.id, locale: "en-US" }),
      harness.service.greet({ id: agent.id, locale: "en-US" }),
    ]);
    const again = await harness.service.greet({ id: agent.id });

    expect(results).toEqual([true, true]);
    expect(again).toBe(false);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      role: { name: "Coach", instructions: "Plan workouts" },
      locale: "en-US",
    });
    expect(harness.greetings).toEqual([
      {
        sessionId: agent.homeSessionId,
        content: "Hi, I'm Coach. Want a plan for this week?",
      },
    ]);
  });

  it("introduces itself by name in the requested language when the model cannot write", async () => {
    const agent = await harness.service.create({
      role: { ...coachRole, name: "小鹿" },
    });
    harness.writeGreeting(async () => {
      throw new Error("no model");
    });

    await harness.service.greet({ id: agent.id, locale: "zh-CN" });

    expect(harness.greetings).toEqual([
      {
        sessionId: agent.homeSessionId,
        content: expect.stringContaining("我是小鹿"),
      },
    ]);
  });

  it("keeps each assistant's own way to address the user and asks when it has none", async () => {
    const coach = await harness.service.create({ role: coachRole });
    await harness.service.update({ id: coach.id, userAddress: "  Boss  " });
    const writer = await harness.service.create({
      role: { ...coachRole, name: "Writer" },
    });
    const written: PersonaGreetingInput[] = [];
    harness.writeGreeting(async (input) => {
      written.push(input);
      throw new Error("no model");
    });

    await harness.service.greet({ id: writer.id, locale: "en-US" });

    expect((await harness.service.get(coach.id))?.userAddress).toBe("Boss");
    expect((await harness.service.get(writer.id))?.userAddress).toBeNull();
    expect(written[0]).toMatchObject({
      userAddress: null,
      otherAddresses: ["Boss"],
    });
    expect(harness.greetings[0]?.content).toContain("what should I call you?");
  });

  it("drafts an unused name and says when no model can run it", async () => {
    await harness.service.create({ role: { ...coachRole, name: "Iris" } });
    const draft = await harness.service.draft({ locale: "en-US" });
    expect(draft.modelAvailable).toBe(false);
    expect(draft.role).toMatchObject({
      agentId: "pi",
      providerId: null,
      avatar: { kind: "shape" },
    });
    expect(draft.role.name).not.toBe("Iris");
    expect(draft.role.name).not.toBe("");
  });

  it("drafts and creates with the default assistant's model, else the first one", async () => {
    harness.models.push(compatible("a", "first"), compatible("b", "second"));
    const fresh = await harness.service.draft({ locale: "zh-CN" });
    expect(fresh).toMatchObject({
      modelAvailable: true,
      role: { providerId: "a", modelId: "first", modelName: "first name" },
    });
    await harness.service.create({
      role: { ...coachRole, providerId: "b", modelId: "second" },
    });
    expect(
      (await harness.service.draft({ locale: "en-US" })).role,
    ).toMatchObject({ providerId: "b", modelId: "second" });
    const unset = await harness.service.create({
      role: { ...coachRole, name: "Nova" },
    });
    expect(unset.role).toMatchObject({ providerId: "b", modelId: "second" });
  });

  it("lists the default first, then pinned agents, then creation order", async () => {
    const coach = await harness.service.create({ role: coachRole });
    const writer = await harness.service.create({
      role: { ...coachRole, name: "Writer" },
    });
    const reader = await harness.service.create({
      role: { ...coachRole, name: "Reader" },
    });
    await harness.service.update({ id: reader.id, pinned: true });

    const names = (await harness.service.list()).map((agent) => agent.id);
    expect(names).toEqual([coach.id, reader.id, writer.id]);
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

  it("refuses to run a personal agent on another engine", async () => {
    await expect(
      harness.service.create({ role: { ...coachRole, agentId: "codex" } }),
    ).rejects.toThrow("Personal agents run on pi");
    const coach = await harness.service.create({ role: coachRole });
    await expect(
      harness.service.update({
        id: coach.id,
        role: { ...coachRole, agentId: "claude-agent" },
      }),
    ).rejects.toThrow("Personal agents run on pi");
    expect(await harness.database.agentRoles.list()).toEqual([
      expect.objectContaining({ id: coach.role.id, agentId: "pi" }),
    ]);
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
        agentId: "pi",
        instructions: "Plan workouts",
      },
    });
  });

  it("deletes an agent with its role and home thread", async () => {
    await harness.service.create({ role: { ...coachRole, name: "助理" } });
    const coach = await harness.service.create({ role: coachRole });

    await harness.service.delete(coach.id);

    expect(await harness.database.agentRoles.getById(coach.role.id)).toBeNull();
    expect(
      await harness.database.sessions.getById(coach.homeSessionId),
    ).toBeNull();
    expect(harness.announcements()).toBe(3);
  });

  it("hands the default to the next agent when the default is deleted", async () => {
    const assistant = await harness.service.create({
      role: { ...coachRole, name: "助理" },
    });
    const coach = await harness.service.create({ role: coachRole });
    const writer = await harness.service.create({
      role: { ...coachRole, name: "Writer" },
    });
    await harness.service.update({ id: writer.id, pinned: true });

    await harness.service.delete(assistant.id);

    expect(harness.service.ownsHomeSession(assistant.homeSessionId)).toBe(
      false,
    );
    const remaining = await harness.service.list();
    expect(remaining.map((agent) => [agent.id, agent.isDefault])).toEqual([
      [writer.id, true],
      [coach.id, false],
    ]);
  });

  it("leaves no default when the last agent is deleted", async () => {
    const assistant = await harness.service.create({ role: coachRole });

    await harness.service.delete(assistant.id);

    expect(await harness.service.list()).toEqual([]);
    const fresh = await harness.service.create({ role: coachRole });
    expect(fresh.isDefault).toBe(true);
  });
});
