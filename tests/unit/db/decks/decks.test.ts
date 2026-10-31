import path from "node:path";
import { createCocurdexDatabase } from "@cocurdex/db/internal/sqlite";
import { type DeckContent, isDeckConflictError } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

function createTestDatabase() {
  const database = createCocurdexDatabase(
    path.join(tempDirs.createSync("cocurdex-decks-"), "cocurdex.sqlite"),
  );
  tempDirs.onCleanup(() => database.close());
  return database;
}

function deckWith(titles: string[]): DeckContent {
  return {
    version: 1,
    size: { width: 1280, height: 720 },
    theme: "default",
    slides: titles.map((title, index) => ({
      id: `s${index}`,
      layout: "title-only",
      slots: {
        title: { kind: "text", paragraphs: [{ runs: [{ text: title }] }] },
      },
      elements: [],
      notes: "",
    })),
  };
}

describe("CocurdexDatabase.decks", () => {
  it("stores content and keeps the slide count in the summary", async () => {
    const database = createTestDatabase();
    const created = await database.decks.create({
      title: "Pitch",
      workspaceId: null,
      content: deckWith(["Intro", "Plan"]),
    });

    expect(created.revision).toBe(1);
    expect(created.slideCount).toBe(2);
    expect(await database.decks.get(created.id)).toEqual(created);
    expect(await database.decks.list()).toEqual([
      expect.objectContaining({
        id: created.id,
        title: "Pitch",
        slideCount: 2,
      }),
    ]);
  });

  it("bumps the revision and rejects writes based on a stale revision", async () => {
    const database = createTestDatabase();
    const created = await database.decks.create({
      title: "Pitch",
      workspaceId: null,
      content: deckWith(["Intro"]),
    });

    const updated = await database.decks.update({
      id: created.id,
      content: deckWith(["Intro", "Plan", "Ask"]),
      expectedRevision: 1,
    });
    expect(updated).toMatchObject({
      revision: 2,
      slideCount: 3,
      title: "Pitch",
    });

    const stale = database.decks.update({
      id: created.id,
      title: "Other",
      expectedRevision: 1,
    });
    await expect(stale).rejects.toSatisfy(isDeckConflictError);
    await expect(
      database.decks.delete({ id: created.id, expectedRevision: 1 }),
    ).rejects.toSatisfy(isDeckConflictError);

    await database.decks.delete({ id: created.id, expectedRevision: 2 });
    expect(await database.decks.get(created.id)).toBeNull();
  });
});
