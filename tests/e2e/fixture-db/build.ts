import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { requestDaemon, subscribeDaemonEvents } from "@cocurdex/daemon/client";
import { DATABASE_FILENAME } from "@cocurdex/daemon/paths";
import {
  CHAT_WORKSPACE_ID,
  type CocurdexDaemonEvent,
  isAcpRegistryAgentId,
  type WorkspaceRecord,
} from "@cocurdex/shared";
import { saveStubProvider } from "../helpers/chat-session";
import {
  type DaemonProcess,
  spawnDaemon,
  waitFor,
} from "../helpers/daemon-process";
import { type StubLlmServer, startStubLlmServer } from "../helpers/llm-stub";
import {
  FIXTURE_DECKS,
  FIXTURE_ISSUES,
  FIXTURE_LABELS,
  FIXTURE_NOTES,
  FIXTURE_ROLES,
  FIXTURE_SESSIONS,
  FIXTURE_WORKSPACE_ID,
  FIXTURE_WORKSPACE_NAME,
  FIXTURE_WORKSPACES,
  type FixtureInterruptedTurn,
  type FixtureIssue,
  type FixtureSession,
  type FixtureTeammate,
  type FixtureTurn,
  type FixtureWorkspace,
} from "./recipe";
import { materializeFixtureWorkspace } from "./workspace";

const resolveFixture = createRequire(import.meta.url).resolve;
const FIXTURE_CREATED_AT = "2026-01-01T09:00:00.000Z";
const RUN_TIMEOUT_MS = 30_000;

export const FIXTURE_MANIFEST_FILENAME = "fixture.json";
export const FIXTURE_DATA_DIRECTORIES = ["image-attachments"];

export interface FixtureManifest {
  workspaceId: string;
  workspaceName: string;
  workspaces: FixtureWorkspace[];
  sessionIds: string[];
  noteCount: number;
  deckCount: number;
  issueCount: number;
}

function workspaceRecord(
  workspace: FixtureWorkspace,
  rootPaths: string[],
  sortOrder: number,
): WorkspaceRecord {
  return {
    id: workspace.id,
    name: workspace.name,
    rootPaths,
    createdAt: FIXTURE_CREATED_AT,
    updatedAt: FIXTURE_CREATED_AT,
    lastOpenedAt: FIXTURE_CREATED_AT,
    sortOrder,
  };
}

function finishedRuns(events: CocurdexDaemonEvent[], sessionId: string) {
  return events.filter(
    (event) =>
      event.type === "run.updated" &&
      event.sessionId === sessionId &&
      (event.run.status === "completed" || event.run.status === "failed"),
  ).length;
}

async function seedRoles(daemon: DaemonProcess) {
  for (const role of FIXTURE_ROLES) {
    await requestDaemon(
      "agentRole.save",
      {
        id: role.id,
        name: role.name,
        avatar: { kind: "emoji", emoji: role.emoji, color: "violet" },
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
      },
      daemon.options,
    );
  }
}

async function seedSession(
  daemon: DaemonProcess,
  stub: StubLlmServer,
  events: CocurdexDaemonEvent[],
  fixture: FixtureSession,
): Promise<string[]> {
  const providerSnapshot = await saveStubProvider(daemon, stub);
  await requestDaemon(
    "session.configure",
    {
      id: fixture.id,
      workspaceId:
        fixture.kind === "chat" ? CHAT_WORKSPACE_ID : FIXTURE_WORKSPACE_ID,
      sessionKind: fixture.kind,
      title: fixture.title,
      agentType: "pi",
      writeMode: fixture.kind === "chat" ? "read-only" : "native-write",
      sessionModeId: null,
      agentRoleId: fixture.roleId ?? null,
      providerSnapshot,
    },
    daemon.options,
  );
  for (const turn of fixture.turns) {
    await runTurn(daemon, stub, events, fixture.id, turn);
  }
  const teammateIds: string[] = [];
  for (const teammate of fixture.teammates ?? []) {
    teammateIds.push(
      await spawnTeammate(daemon, stub, events, fixture.id, teammate),
    );
  }
  for (const turn of fixture.turnsAfterTeam ?? []) {
    await runTurn(daemon, stub, events, fixture.id, turn);
  }
  if (fixture.interruptedTurn) {
    await leaveTurnRunning(
      daemon,
      stub,
      events,
      fixture.id,
      fixture.interruptedTurn,
    );
  }
  await requestDaemon(
    "session.updateTitle",
    { sessionId: fixture.id, title: fixture.title },
    daemon.options,
  );
  if (fixture.pinned) {
    await requestDaemon(
      "session.setPinned",
      { sessionId: fixture.id, pinned: true },
      daemon.options,
    );
  }
  if (fixture.archived) {
    await requestDaemon(
      "session.archive",
      { sessionId: fixture.id },
      daemon.options,
    );
  }
  return teammateIds;
}

async function runTurn(
  daemon: DaemonProcess,
  stub: StubLlmServer,
  events: CocurdexDaemonEvent[],
  sessionId: string,
  turn: FixtureTurn,
) {
  const before = finishedRuns(events, sessionId);
  stub.plan = { kind: "script", turns: structuredClone(turn.replies) };
  await requestDaemon(
    "session.send",
    { sessionId, messageId: turn.messageId, content: turn.prompt },
    daemon.options,
  );
  await waitFor(() => finishedRuns(events, sessionId) > before, RUN_TIMEOUT_MS);
}

async function spawnTeammate(
  daemon: DaemonProcess,
  stub: StubLlmServer,
  events: CocurdexDaemonEvent[],
  leadSessionId: string,
  teammate: FixtureTeammate,
) {
  const leadBefore = finishedRuns(events, leadSessionId);
  stub.plan = {
    kind: "script",
    turns: structuredClone([...teammate.replies, ...teammate.leadReplies]),
  };
  const member = await requestDaemon(
    "team.spawn",
    { leadSessionId, name: teammate.name, prompt: teammate.prompt },
    daemon.options,
  );
  await waitFor(
    () =>
      finishedRuns(events, member.sessionId) > 0 &&
      finishedRuns(events, leadSessionId) > leadBefore,
    RUN_TIMEOUT_MS,
  );
  return member.sessionId;
}

async function leaveTurnRunning(
  daemon: DaemonProcess,
  stub: StubLlmServer,
  events: CocurdexDaemonEvent[],
  sessionId: string,
  turn: FixtureInterruptedTurn,
) {
  stub.plan = { kind: "hang" };
  await requestDaemon(
    "session.send",
    { sessionId, messageId: turn.messageId, content: turn.prompt },
    daemon.options,
  );
  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === "run.updated" &&
          event.sessionId === sessionId &&
          event.run.status === "running",
      ),
    RUN_TIMEOUT_MS,
  );
  await requestDaemon(
    "session.send",
    {
      sessionId,
      messageId: turn.queued.messageId,
      content: turn.queued.prompt,
      delivery: "queue-after-run",
    },
    daemon.options,
  );
}

async function seedNotes(daemon: DaemonProcess) {
  const ids = new Map<string, string>();
  for (const note of FIXTURE_NOTES) {
    const created = await requestDaemon(
      "note.create",
      {
        title: note.title,
        bodyMarkdown: note.bodyMarkdown,
        parentId: note.parentKey ? ids.get(note.parentKey) : null,
        workspaceId: note.inWorkspace ? FIXTURE_WORKSPACE_ID : null,
      },
      daemon.options,
    );
    ids.set(note.key, created.id);
  }
}

async function seedDecks(daemon: DaemonProcess) {
  for (const deck of FIXTURE_DECKS) {
    await requestDaemon(
      "deck.create",
      {
        title: deck.title,
        markdown: deck.markdown,
        workspaceId: deck.inWorkspace ? FIXTURE_WORKSPACE_ID : null,
      },
      daemon.options,
    );
  }
}

async function withFixtureImage(daemon: DaemonProcess, issue: FixtureIssue) {
  if (!issue.image) return issue.description;
  const image = await requestDaemon(
    "image.import",
    {
      path: resolveFixture(`../fixtures/${issue.image.fixture}`),
      name: issue.image.name,
    },
    daemon.options,
  );
  return `${issue.description}\n\n${image.markdown}`;
}

async function seedIssues(daemon: DaemonProcess) {
  const labelIds = new Map<string, string>();
  for (const label of FIXTURE_LABELS) {
    const created = await requestDaemon(
      "issue.createLabel",
      label,
      daemon.options,
    );
    labelIds.set(label.name, created.id);
  }
  const [view] = await requestDaemon("issue.listViews", daemon.options);
  if (!view) throw new Error("Fixture daemon has no issue view");
  for (const issue of FIXTURE_ISSUES) {
    const description = await withFixtureImage(daemon, issue);
    const created = await requestDaemon(
      "issue.create",
      {
        viewId: view.id,
        title: issue.title,
        description: description || null,
        status: issue.status,
        priority: issue.priority,
        workspaceId: FIXTURE_WORKSPACE_ID,
        labelIds: issue.labels.flatMap((name) => labelIds.get(name) ?? []),
      },
      daemon.options,
    );
    if (issue.comment) {
      await requestDaemon(
        "issue.comment",
        { id: created.id, body: issue.comment },
        daemon.options,
      );
    }
    if (issue.linkedSessionId) {
      await requestDaemon(
        "issue.linkSession",
        { id: created.id, sessionId: issue.linkedSessionId },
        daemon.options,
      );
    }
  }
}

function pathVariants(from: string, to: string): [string, string][] {
  const pairs: [string, string][] = [[from, to]];
  const escapedFrom = JSON.stringify(from).slice(1, -1);
  if (escapedFrom !== from) {
    pairs.push([escapedFrom, JSON.stringify(to).slice(1, -1)]);
  }
  const posixFrom = from.replaceAll("\\", "/");
  if (posixFrom !== from) pairs.push([posixFrom, to.replaceAll("\\", "/")]);
  return pairs;
}

function textColumns(database: DatabaseSync) {
  const tables = database
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .all() as { name: string; sql: string }[];
  const virtualTables = tables
    .filter((table) => /^CREATE VIRTUAL/i.test(table.sql))
    .map((table) => table.name);
  const ordinary = tables.filter(
    (table) =>
      !virtualTables.some(
        (name) => table.name === name || table.name.startsWith(`${name}_`),
      ),
  );
  return ordinary.flatMap(({ name }) =>
    (
      database.prepare(`PRAGMA table_info("${name}")`).all() as {
        name: string;
        type: string;
      }[]
    )
      .filter((column) => column.type === "" || /TEXT/i.test(column.type))
      .map((column) => ({ table: name, column: column.name })),
  );
}

function replaceBuildPaths(database: DatabaseSync, scratch: string) {
  const placeholder = path.join(path.parse(scratch).root, "fixture");
  const prefixes = new Set([scratch, realpathSync.native(scratch)]);
  const replacements = [...prefixes]
    .sort((left, right) => right.length - left.length)
    .flatMap((prefix) => pathVariants(prefix, placeholder));
  for (const { table, column } of textColumns(database)) {
    const update = database.prepare(
      `UPDATE "${table}" SET "${column}" = replace("${column}", ?, ?) WHERE instr("${column}", ?) > 0`,
    );
    for (const [from, to] of replacements) update.run(from, to, from);
  }
}

function exportDatabase(source: string, target: string, scratch: string) {
  rmSync(target, { force: true });
  const reader = new DatabaseSync(source, { readOnly: true });
  try {
    reader.prepare("VACUUM INTO ?").run(target);
  } finally {
    reader.close();
  }
  const writer = new DatabaseSync(target);
  try {
    writer.exec("PRAGMA journal_mode = DELETE; PRAGMA secure_delete = ON;");
    replaceBuildPaths(writer, scratch);
    writer.exec("VACUUM");
  } finally {
    writer.close();
  }
}

async function removeMachineAgents(daemon: DaemonProcess) {
  const agents = await requestDaemon("agent.list", daemon.options);
  for (const agent of agents) {
    if (!isAcpRegistryAgentId(agent.id)) continue;
    await requestDaemon(
      "acpRegistry.uninstall",
      { agentId: agent.id },
      daemon.options,
    );
  }
}

export async function buildFixtureDb(outDir: string): Promise<FixtureManifest> {
  const scratch = mkdtempSync(path.join(tmpdir(), "cfx-"));
  const userDataPath = path.join(scratch, "u");
  const workspaceParent = path.join(scratch, "w");
  const stub = await startStubLlmServer();
  const daemon = await spawnDaemon({ userDataPath });
  const events: CocurdexDaemonEvent[] = [];
  const subscription = await subscribeDaemonEvents(
    (event) => events.push(event),
    daemon.options,
  );
  try {
    for (const [index, workspace] of FIXTURE_WORKSPACES.entries()) {
      const rootPaths = await materializeFixtureWorkspace(
        workspace,
        workspaceParent,
      );
      await requestDaemon(
        "workspace.save",
        { workspace: workspaceRecord(workspace, rootPaths, index * 1000) },
        daemon.options,
      );
    }
    await seedRoles(daemon);
    const teammateIds: string[] = [];
    for (const session of FIXTURE_SESSIONS) {
      teammateIds.push(...(await seedSession(daemon, stub, events, session)));
    }
    await seedNotes(daemon);
    await seedDecks(daemon);
    await seedIssues(daemon);
    await removeMachineAgents(daemon);
    subscription.close();
    const exitCode = await daemon.stop();
    if (exitCode === null) throw new Error("Fixture daemon did not stop");

    await mkdir(outDir, { recursive: true });
    exportDatabase(
      path.join(userDataPath, DATABASE_FILENAME),
      path.join(outDir, DATABASE_FILENAME),
      scratch,
    );
    for (const directory of FIXTURE_DATA_DIRECTORIES) {
      const source = path.join(userDataPath, directory);
      if (!existsSync(source)) continue;
      await cp(source, path.join(outDir, directory), { recursive: true });
    }
    const manifest: FixtureManifest = {
      workspaceId: FIXTURE_WORKSPACE_ID,
      workspaceName: FIXTURE_WORKSPACE_NAME,
      workspaces: FIXTURE_WORKSPACES,
      sessionIds: [
        ...FIXTURE_SESSIONS.map((session) => session.id),
        ...teammateIds,
      ],
      noteCount: FIXTURE_NOTES.length,
      deckCount: FIXTURE_DECKS.length,
      issueCount: FIXTURE_ISSUES.length,
    };
    await writeFile(
      path.join(outDir, FIXTURE_MANIFEST_FILENAME),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    return manifest;
  } catch (error) {
    throw new Error(
      `Fixture build failed: ${error instanceof Error ? error.message : String(error)}\n${daemon.stderr()}`,
    );
  } finally {
    subscription.close();
    await daemon.stop();
    await stub.close();
    await rm(scratch, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}
