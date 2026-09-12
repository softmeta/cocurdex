import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startDaemonServer } from "./wire";

const directories: string[] = [];
const daemons: Awaited<ReturnType<typeof startDaemonServer>>[] = [];

afterEach(async () => {
  await Promise.all(daemons.splice(0).map((daemon) => daemon.close()));
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function start(userDataPath?: string) {
  if (!userDataPath) {
    userDataPath = await mkdtemp(path.join(tmpdir(), "cd-recovery-"));
    directories.push(userDataPath);
  }
  const daemon = await startDaemonServer({
    userDataPath,
    runtimeFingerprint: "test",
    token: "test-token",
  });
  daemons.push(daemon);
  return { daemon, userDataPath };
}

async function seedActiveWork(
  daemon: Awaited<ReturnType<typeof startDaemonServer>>,
) {
  const database = await daemon.service.state.getChatDatabase();
  const timestamp = "2026-09-12T00:00:00.000Z";
  await database.workspaces.upsert({
    id: "workspace",
    name: "Recovery",
    rootPaths: ["/missing-recovery-workspace"],
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
    sortOrder: 1000,
  });
  await database.sessions.upsert({
    id: "session",
    workspaceId: "workspace",
    title: "Active session",
    agentType: "pi",
    status: "running",
    writeMode: "read-only",
    collaborationMode: "default",
    createdAt: timestamp,
    updatedAt: timestamp,
    lastMessageAt: null,
  });
  await database.toolCalls.upsert({
    id: "tool",
    sessionId: "session",
    title: "Active tool",
    status: "in_progress",
    content: [],
    locations: [],
    startedAt: timestamp,
    updatedAt: timestamp,
  });
  return database;
}

describe("daemon startup recovery", () => {
  it("does not reset active sessions when clients bootstrap repeatedly", async () => {
    const { daemon } = await start();
    await seedActiveWork(daemon);
    for (let index = 0; index < 2; index += 1) {
      const snapshot = await daemon.service.bootstrap();
      expect(snapshot.sessions).toEqual([
        expect.objectContaining({ id: "session", status: "running" }),
      ]);
    }
  });

  it("rejects a second daemon without sweeping the incumbent's work", async () => {
    const { daemon, userDataPath } = await start();
    const database = await seedActiveWork(daemon);
    await expect(
      startDaemonServer({
        userDataPath,
        runtimeFingerprint: "contender",
        token: "other-token",
      }),
    ).rejects.toThrow();
    expect(await database.toolCalls.listBySessionId("session")).toEqual([
      expect.objectContaining({ id: "tool", status: "in_progress" }),
    ]);
    expect(await database.sessions.getById("session")).toMatchObject({
      status: "running",
    });
  });

  it("recovers previous work before any client calls bootstrap", async () => {
    const { daemon: first, userDataPath } = await start();
    await seedActiveWork(first);
    await first.close();
    const { daemon: second } = await start(userDataPath);
    expect(await second.service.state.getSession("session")).toMatchObject({
      status: "idle",
    });
    expect(
      await second.service.state.listToolCallsBySessionId("session"),
    ).toEqual([expect.objectContaining({ id: "tool", status: "failed" })]);
  });
});
