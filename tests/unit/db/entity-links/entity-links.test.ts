import path from "node:path";
import { createCocurdexDatabase } from "@cocurdex/db/internal/sqlite";
import { DEFAULT_VIEW_ID, entityUri } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

async function seed() {
  const database = createCocurdexDatabase(
    path.join(tempDirs.createSync("cocurdex-links-"), "cocurdex.sqlite"),
  );
  const issue = await database.issues.createIssue({
    viewId: DEFAULT_VIEW_ID,
    columnId: "backlog",
    title: "Support gift cards",
    description: "",
  });
  const deck = await database.decks.create({
    title: "Gift card pitch",
    workspaceId: null,
    content: {
      version: 1,
      size: { width: 1280, height: 720 },
      theme: "default",
      slides: [],
    },
  });
  const target = await database.notes.create({ title: "Gift card math" });
  const note = await database.notes.create({
    title: "Gift card plan",
    bodyMarkdown: [
      `Track [the issue](${entityUri({ kind: "issue", id: issue.id })}).`,
      `See [math](${entityUri({ kind: "note", id: target.id })}).`,
    ].join("\n"),
  });
  return { database, issue, deck, note, target };
}

describe("CocurdexDatabase.entityLinks", () => {
  it("lists manual links from both ends and body mentions with titles", async () => {
    const { database, issue, deck, note, target } = await seed();
    const noteRef = { kind: "note", id: note.id } as const;
    const deckRef = { kind: "deck", id: deck.id } as const;

    expect(await database.entityLinks.add(deckRef, noteRef)).toBe(true);
    expect(await database.entityLinks.add(noteRef, deckRef)).toBe(false);

    const fromNote = await database.entityLinks.list(noteRef);
    expect(
      fromNote.map((link) => [link.relation, link.target.kind, link.title]),
    ).toEqual([
      ["related", "deck", "Gift card pitch"],
      ["mentions", "issue", "Support gift cards"],
      ["mentions", "note", "Gift card math"],
    ]);
    expect(fromNote[0]?.removable).toBe(true);
    expect(fromNote[1]?.detail).toBe(issue.identifier);

    const fromDeck = await database.entityLinks.list(deckRef);
    expect(fromDeck.map((link) => [link.relation, link.target.id])).toEqual([
      ["related", note.id],
    ]);
    const fromIssue = await database.entityLinks.list({
      kind: "issue",
      id: issue.id,
    });
    expect(fromIssue.map((link) => [link.relation, link.target.id])).toEqual([
      ["mentioned-by", note.id],
    ]);
    const fromTarget = await database.entityLinks.list({
      kind: "note",
      id: target.id,
    });
    expect(fromTarget.map((link) => [link.relation, link.target.id])).toEqual([
      ["mentioned-by", note.id],
    ]);

    expect(await database.entityLinks.remove(noteRef, deckRef)).toBe(true);
    expect(await database.entityLinks.list(deckRef)).toEqual([]);
  });

  it("resolves issue identifier mentions in both directions", async () => {
    const { database, issue } = await seed();
    const note = await database.notes.create({
      title: "Gift card follow-up",
      bodyMarkdown: `Blocked on [${issue.identifier}](${entityUri({ kind: "issue", id: issue.identifier })}).`,
    });

    const fromNote = await database.entityLinks.list({
      kind: "note",
      id: note.id,
    });
    expect(fromNote.map((link) => [link.relation, link.target])).toEqual([
      ["mentions", { kind: "issue", id: issue.id }],
    ]);
    const fromIssue = await database.entityLinks.list({
      kind: "issue",
      id: issue.id,
    });
    expect(
      fromIssue
        .filter((link) => link.target.id === note.id)
        .map((link) => link.relation),
    ).toEqual(["mentioned-by"]);
  });

  it("omits archived sessions, which cannot be opened", async () => {
    const { database, note } = await seed();
    const timestamp = "2026-10-01T00:00:00.000Z";
    await database.workspaces.upsert({
      id: "workspace",
      name: "Gift cards",
      rootPaths: [path.join(tempDirs.createSync("cocurdex-links-ws-"), "shop")],
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
      sortOrder: 1,
    });
    await database.sessions.upsert({
      id: "session",
      workspaceId: "workspace",
      title: "Build gift cards",
      agentType: "acp:grok-build",
      status: "idle",
      writeMode: "native-write",
      sessionModeId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastMessageAt: timestamp,
      archivedAt: null,
    });
    const noteRef = { kind: "note", id: note.id } as const;
    await database.entityLinks.add(noteRef, { kind: "session", id: "session" });
    const sessionLinks = async () =>
      (await database.entityLinks.list(noteRef)).filter(
        (link) => link.target.kind === "session",
      );
    expect(await sessionLinks()).toHaveLength(1);

    await database.sessions.archive("session", timestamp);

    expect(await sessionLinks()).toEqual([]);
  });

  it("drops manual links when either entity is deleted", async () => {
    const { database, deck, note } = await seed();
    const noteRef = { kind: "note", id: note.id } as const;
    await database.entityLinks.add(noteRef, { kind: "deck", id: deck.id });

    await database.decks.delete({ id: deck.id });

    const related = await database.entityLinks.list(noteRef);
    expect(related.some((link) => link.target.kind === "deck")).toBe(false);
  });

  it("offers notes, issues, and decks as link candidates", async () => {
    const { database, issue, deck, note } = await seed();
    await database.notes.create({ kind: "folder", title: "Archive" });
    const candidates = await database.entityLinks.candidates();
    expect(candidates).toEqual(
      expect.arrayContaining([
        {
          target: { kind: "note", id: note.id },
          title: note.title,
          detail: null,
        },
        {
          target: { kind: "issue", id: issue.id },
          title: issue.title,
          detail: issue.identifier,
        },
        {
          target: { kind: "deck", id: deck.id },
          title: deck.title,
          detail: null,
        },
      ]),
    );
    expect(candidates.some((item) => item.title === "Archive")).toBe(false);
  });

  it("resolves issues by identifier and rejects unknown entities", async () => {
    const { database, issue } = await seed();
    expect(
      await database.entityLinks.resolve({
        kind: "issue",
        id: issue.identifier,
      }),
    ).toEqual({ kind: "issue", id: issue.id });
    expect(
      await database.entityLinks.resolve({ kind: "deck", id: "missing" }),
    ).toBeNull();
  });
});
