import { BuiltinMemoryProvider } from "@cocurdex/daemon/internal/memory/builtin-provider";
import {
  applyMemorySync,
  planMemorySync,
  summarizeMemorySync,
} from "@cocurdex/daemon/internal/memory/library-sync";
import type {
  MemoryProvider,
  MemoryTransferEntry,
} from "@cocurdex/daemon/internal/memory/provider";
import type {
  MemoryRememberInput,
  MemoryRememberResult,
  MemoryUpdateInput,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { createMemoryStore } from "./helpers/memory-store";

/** An external library that assigns its own ids, as rsrs does. */
class ExternalLibrary implements Partial<MemoryProvider> {
  readonly live = new Map<string, MemoryTransferEntry>();
  private created = 0;
  refuseWrites = false;

  constructor(
    private readonly now: () => string,
    readonly id = "external",
  ) {}

  seed(id: string, title: string, content: string, updatedAt: string) {
    this.live.set(id, {
      id,
      title,
      content,
      kind: null,
      importance: "trivial",
      tags: [],
      project: null,
      parentId: null,
      supersedes: [],
      supersededBy: null,
      seeAlso: [],
      createdAt: updatedAt,
      updatedAt,
      device: null,
    });
  }

  async snapshot() {
    return [...this.live.values()];
  }

  async remember(input: MemoryRememberInput): Promise<MemoryRememberResult> {
    if (this.refuseWrites) throw new Error("library is read-only");
    this.created += 1;
    const id = `ext-${this.created}`;
    this.seed(id, input.title, input.content, this.now());
    const entry = this.live.get(id) as MemoryTransferEntry;
    entry.parentId = input.parentId ?? null;
    entry.importance = input.importance ?? "trivial";
    entry.tags = input.tags ?? [];
    return {
      action: "created",
      id,
      title: input.title,
      candidates: [],
      message: null,
    };
  }

  async update(input: MemoryUpdateInput) {
    const entry = this.live.get(input.id);
    if (!entry) throw new Error(`not found #${input.id}`);
    this.live.set(input.id, {
      ...entry,
      title: input.title ?? entry.title,
      content: input.content ?? entry.content,
      updatedAt: this.now(),
    });
  }

  async forget(id: string) {
    if (!this.live.delete(id)) throw new Error(`not found #${id}`);
  }
}

function createPair() {
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 10, 15, 0, 0, tick++));
  const store = createMemoryStore();
  const builtin = new BuiltinMemoryProvider({
    ...store,
    device: "test-host",
    now,
  });
  const external = new ExternalLibrary(() => now().toISOString());
  const sync = async (library = external) => {
    const plan = planMemorySync(
      store.entries.all(),
      await library.snapshot(),
      store.entries.remoteIds(library.id),
    );
    const failed = await applyMemorySync(plan, {
      builtin,
      entries: store.entries,
      transaction: store.transaction,
      external: library as unknown as MemoryProvider,
      now,
    });
    return summarizeMemorySync(plan, failed);
  };
  const save = async (title: string, content: string, parentId?: string) =>
    (await builtin.remember({ title, content, parentId, force: true }))
      .id as string;
  const localTitles = async () =>
    (await builtin.list({ limit: 50, since: null, project: null }))
      .map((entry) => entry.title)
      .sort();
  const externalTitles = () =>
    [...external.live.values()].map((entry) => entry.title).sort();
  const library = (id: string) =>
    new ExternalLibrary(() => now().toISOString(), id);
  return {
    builtin,
    external,
    store,
    sync,
    save,
    library,
    localTitles,
    externalTitles,
  };
}

const UNCHANGED = {
  builtin: { added: 0, updated: 0 },
  external: { added: 0, updated: 0, removed: 0 },
  failed: 0,
};

describe("memory library sync", () => {
  it("brings both sides to the same memories and then settles", async () => {
    const { external, sync, save, localTitles, externalTitles } = createPair();
    external.seed(
      "ext-old",
      "Prefers tea",
      "Green tea",
      "2026-11-01T00:00:00.000Z",
    );
    const cause = await save("Release failed", "The tag was missing");
    await save("Tag before releasing", "Push the tag first", cause);

    expect(await sync()).toEqual({
      builtin: { added: 1, updated: 0 },
      external: { added: 2, updated: 0, removed: 0 },
      failed: 0,
    });
    const all = ["Prefers tea", "Release failed", "Tag before releasing"];
    expect(await localTitles()).toEqual(all);
    expect(externalTitles()).toEqual(all);
    const child = [...external.live.values()].find(
      (entry) => entry.title === "Tag before releasing",
    );
    expect(external.live.get(child?.parentId ?? "")?.title).toBe(
      "Release failed",
    );
    expect(await sync()).toEqual(UNCHANGED);
  });

  it("carries edits and deletions made in the store to the library", async () => {
    const { builtin, external, sync, save, externalTitles } = createPair();
    const kept = await save("Prefers tea", "Green tea");
    const dropped = await save("Old habit", "Coffee at night");
    await sync();

    await builtin.update({ id: kept, content: "Oolong tea" });
    await builtin.forget(dropped);

    expect(await sync()).toMatchObject({
      external: { added: 0, updated: 1, removed: 1 },
      failed: 0,
    });
    expect(externalTitles()).toEqual(["Prefers tea"]);
    expect([...external.live.values()][0].content).toBe("Oolong tea");
    expect(await sync()).toEqual(UNCHANGED);
  });

  it("takes a newer edit made in the library, keeping the store's id", async () => {
    const { builtin, external, sync, save } = createPair();
    const id = await save("Prefers tea", "Green tea");
    await sync();
    const [linked] = [...external.live.keys()];

    await external.update({ id: linked, content: "Jasmine tea" });

    expect(await sync()).toMatchObject({ builtin: { added: 0, updated: 1 } });
    expect((await builtin.show(id)).entry?.content).toBe("Jasmine tea");
  });

  it("writes memories back to a library that lost them instead of deleting its own", async () => {
    const { external, sync, save, localTitles, externalTitles } = createPair();
    await save("Prefers tea", "Green tea");
    await sync();

    external.live.clear();

    expect(await sync()).toMatchObject({
      builtin: { added: 0, updated: 0 },
      external: { added: 1 },
    });
    expect(await localTitles()).toEqual(["Prefers tea"]);
    expect(externalTitles()).toEqual(["Prefers tea"]);
  });

  it("fills a newly chosen library and leaves the previous one's links alone", async () => {
    const { external, library, sync, save, localTitles } = createPair();
    await save("Release flow", "Tag beta first");
    await sync();
    const second = library("second");
    second.seed(
      "own-1",
      "Prefers tea",
      "Green tea",
      "2026-11-01T00:00:00.000Z",
    );

    expect(await sync(second)).toMatchObject({
      builtin: { added: 1, updated: 0 },
      external: { added: 1, updated: 0, removed: 0 },
    });
    expect(
      [...second.live.values()].map((entry) => entry.title).sort(),
    ).toEqual(["Prefers tea", "Release flow"]);
    expect(await sync()).toMatchObject({
      builtin: { added: 0, updated: 0 },
      external: { added: 1, updated: 0, removed: 0 },
    });
    expect(external.live.size).toBe(2);
    expect(await sync(second)).toEqual(UNCHANGED);
    expect(await localTitles()).toEqual(["Prefers tea", "Release flow"]);
  });

  it("keeps a refused write for the next sync", async () => {
    const { external, sync, save, externalTitles } = createPair();
    await save("Prefers tea", "Green tea");

    external.refuseWrites = true;
    expect(await sync()).toMatchObject({ failed: 1 });
    expect(externalTitles()).toEqual([]);

    external.refuseWrites = false;
    expect(await sync()).toMatchObject({ external: { added: 1 }, failed: 0 });
    expect(externalTitles()).toEqual(["Prefers tea"]);
  });
});
