import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_VIEW_ID } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { createCocurdexDatabase } from "../sqlite";

function createTestDatabase() {
  return createCocurdexDatabase(
    path.join(
      mkdtempSync(path.join(tmpdir(), "cocurdex-issue-ops-")),
      "cocurdex.sqlite",
    ),
  );
}

async function createIssue(
  database: ReturnType<typeof createTestDatabase>,
  title: string,
  extra: { status?: string; parentId?: string; labelIds?: string[] } = {},
) {
  return database.issues.createIssue({
    viewId: DEFAULT_VIEW_ID,
    title,
    ...extra,
  });
}

describe("issue operations", () => {
  it("numbers issues in order and resolves identifiers", async () => {
    const database = createTestDatabase();
    const first = await createIssue(database, "First");
    const second = await createIssue(database, "Second");

    expect([first.identifier, second.identifier]).toEqual(["COC-1", "COC-2"]);
    for (const ref of ["COC-2", "coc-2", "#2", "2", second.id]) {
      expect((await database.issues.getIssue({ id: ref }))?.id).toBe(second.id);
    }
    await database.issues.deleteIssue({ id: second.id });
    expect((await createIssue(database, "Third")).identifier).toBe("COC-2");
    database.close();
  });

  it("stamps completion when an issue enters a closed status", async () => {
    const database = createTestDatabase();
    const issue = await createIssue(database, "Ship it", { status: "doing" });
    expect(issue.statusCategory).toBe("started");
    expect(issue.completedAt).toBeNull();

    const done = await database.issues.updateIssue({
      viewId: DEFAULT_VIEW_ID,
      id: issue.id,
      status: "done",
    });
    expect(done.statusCategory).toBe("completed");
    expect(done.completedAt).not.toBeNull();

    const reopened = await database.issues.moveIssue({
      viewId: DEFAULT_VIEW_ID,
      id: issue.id,
      columnId: "review",
      sortOrder: 0,
    });
    expect(reopened.completedAt).toBeNull();

    await database.issues.updateColumn({
      field: "status",
      id: "review",
      category: "canceled",
    });
    const canceled = await database.issues.getIssue({ id: issue.id });
    expect(canceled?.statusCategory).toBe("canceled");
    expect(canceled?.completedAt).not.toBeNull();
    database.close();
  });

  it("assigns labels by id or name and filters views by them", async () => {
    const database = createTestDatabase();
    const bug = await database.issues.createLabel({ name: "Bug" });
    await database.issues.createLabel({ name: "Agent" });
    const labeled = await createIssue(database, "Crash", {
      labelIds: [bug.id, "agent"],
    });
    await createIssue(database, "Plain");
    await expect(database.issues.createLabel({ name: "bug" })).rejects.toThrow(
      "already exists",
    );

    const view = await database.issues.updateView({
      viewId: DEFAULT_VIEW_ID,
      filters: [{ field: "labelId", op: "eq", value: bug.id }],
    });
    expect(view.issues.map((issue) => issue.id)).toEqual([labeled.id]);
    expect(view.labels.map((label) => label.name)).toEqual(["Agent", "Bug"]);

    await database.issues.deleteLabel({ id: bug.id });
    const after = await database.issues.getIssue({ id: labeled.id });
    expect(after?.labelIds).toHaveLength(1);
    database.close();
  });

  it("hides closed issues with a status category filter", async () => {
    const database = createTestDatabase();
    const open = await createIssue(database, "Open");
    await createIssue(database, "Closed", { status: "done" });
    const view = await database.issues.updateView({
      viewId: DEFAULT_VIEW_ID,
      filters: [{ field: "statusCategory", op: "neq", value: "completed" }],
    });
    expect(view.issues.map((issue) => issue.id)).toEqual([open.id]);
    database.close();
  });

  it("nests sub-issues and rejects parent cycles", async () => {
    const database = createTestDatabase();
    const epic = await createIssue(database, "Epic");
    const child = await createIssue(database, "Child", { parentId: "COC-1" });
    const grandchild = await createIssue(database, "Grandchild", {
      parentId: child.id,
    });

    const detail = await database.issues.getIssueDetail({ id: epic.id });
    expect(detail?.children.map((entry) => entry.identifier)).toEqual([
      "COC-2",
    ]);
    await expect(
      database.issues.updateIssue({
        viewId: DEFAULT_VIEW_ID,
        id: epic.id,
        parentId: grandchild.id,
      }),
    ).rejects.toThrow("own ancestor");

    await database.issues.deleteIssue({ id: child.id });
    expect(
      (await database.issues.getIssue({ id: grandchild.id }))?.parentId,
    ).toBeNull();
    database.close();
  });

  it("records relations on both issues and keeps related links symmetric", async () => {
    const database = createTestDatabase();
    const api = await createIssue(database, "API");
    const ui = await createIssue(database, "UI");

    const detail = await database.issues.addRelation({
      id: api.id,
      kind: "blocks",
      relatedId: "COC-2",
    });
    expect(detail.relations).toEqual([
      expect.objectContaining({
        kind: "blocks",
        direction: "outgoing",
        issue: expect.objectContaining({ id: ui.id }),
      }),
    ]);
    const blocked = await database.issues.getIssueDetail({ id: ui.id });
    expect(blocked?.relations[0]?.direction).toBe("incoming");
    expect(blocked?.events.map((event) => event.kind)).toEqual([
      "created",
      "relation_added",
    ]);

    await database.issues.addRelation({
      id: api.id,
      kind: "related",
      relatedId: ui.id,
    });
    const repeated = await database.issues.addRelation({
      id: ui.id,
      kind: "related",
      relatedId: api.id,
    });
    expect(
      repeated.relations.filter((relation) => relation.kind === "related"),
    ).toHaveLength(1);
    await expect(
      database.issues.addRelation({
        id: api.id,
        kind: "blocks",
        relatedId: api.id,
      }),
    ).rejects.toThrow("relate to itself");

    const removed = await database.issues.removeRelation({
      id: ui.id,
      kind: "related",
      relatedId: api.id,
    });
    expect(removed.relations.map((relation) => relation.kind)).toEqual([
      "blocks",
    ]);
    database.close();
  });

  it("keeps an activity log of field changes and comments with actors", async () => {
    const database = createTestDatabase();
    const label = await database.issues.createLabel({ name: "Agent" });
    const issue = await createIssue(database, "Draft");

    await database.issues.updateIssue({
      viewId: DEFAULT_VIEW_ID,
      id: issue.id,
      title: "Final",
      priority: "high",
      labelIds: [label.id],
      actor: { kind: "cli" },
    });
    await database.issues.updateIssue({
      viewId: DEFAULT_VIEW_ID,
      id: issue.id,
      title: "Final",
    });
    const detail = await database.issues.comment({
      id: issue.id,
      body: "  Checks pass.  ",
      actor: { kind: "cli" },
    });

    expect(detail.events.map((event) => event.kind)).toEqual([
      "created",
      "updated",
      "commented",
    ]);
    expect(detail.events[1]).toMatchObject({
      actor: { kind: "cli" },
      changes: [
        { field: "title", from: "Draft", to: "Final" },
        { field: "priority", from: "none", to: "high" },
        { field: "labels", from: null, to: "Agent" },
      ],
    });
    expect(detail.events[2]?.body).toBe("Checks pass.");
    await expect(
      database.issues.comment({ id: issue.id, body: "  " }),
    ).rejects.toThrow("body is required");
    database.close();
  });

  it("links a session once and lists it on the issue", async () => {
    const database = createTestDatabase();
    const now = "2026-10-08T00:00:00.000Z";
    await database.workspaces.upsert({
      id: "workspace-1",
      name: "repo",
      rootPaths: [path.join(tmpdir(), "repo")],
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      sortOrder: 1000,
    });
    await database.sessions.upsert({
      id: "session-1",
      workspaceId: "workspace-1",
      title: "Implement",
      agentType: "codex",
      status: "idle",
      writeMode: "native-write",
      sessionModeId: null,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      archivedAt: null,
    });
    const issue = await createIssue(database, "Build");

    expect(
      await database.issues.linkSession({
        id: issue.id,
        sessionId: "session-1",
      }),
    ).toBe(true);
    expect(
      await database.issues.linkSession({
        id: issue.id,
        sessionId: "session-1",
      }),
    ).toBe(false);
    await expect(
      database.issues.linkSession({ id: issue.id, sessionId: "missing" }),
    ).rejects.toThrow("Session not found");

    const detail = await database.issues.getIssueDetail({ id: issue.id });
    expect(detail?.sessions).toEqual([
      expect.objectContaining({ sessionId: "session-1", title: "Implement" }),
    ]);
    expect(detail?.events.at(-1)).toMatchObject({
      kind: "session_linked",
      actor: { kind: "session", sessionId: "session-1" },
    });
    const view = await database.issues.loadView({ viewId: DEFAULT_VIEW_ID });
    expect(
      view?.issues.find((candidate) => candidate.id === issue.id)?.sessionIds,
    ).toEqual(["session-1"]);
    expect(
      (await database.issues.getIssue({ id: issue.id }))?.sessionIds,
    ).toEqual(["session-1"]);
    const second = await createIssue(database, "Review");
    await database.issues.linkSession({
      id: second.id,
      sessionId: "session-1",
    });
    expect(await database.issues.listLinkedSessionIds()).toEqual(["session-1"]);
    database.close();
  });
});
