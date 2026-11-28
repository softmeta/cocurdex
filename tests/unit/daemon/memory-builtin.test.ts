import path from "node:path";
import { BuiltinMemoryProvider } from "@cocurdex/daemon/internal/memory/builtin-provider";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";
import { createMemoryStore } from "./helpers/memory-store";

const temp = createTempDirs();

afterAll(() => temp.cleanup());

function createProvider() {
  let tick = 0;
  return new BuiltinMemoryProvider({
    ...createMemoryStore(),
    device: "test-host",
    now: () => new Date(Date.UTC(2026, 10, 15, 0, 0, tick++)),
  });
}

async function seed(provider: BuiltinMemoryProvider) {
  const save = async (title: string, content: string) =>
    (await provider.remember({ title, content, force: true })).id as string;
  return {
    release: await save(
      "发版流程：先发 beta 再转正",
      "每天 04:00 出 beta，验证通过后用 --promote 转正",
    ),
    address: await save("称呼", "用户希望被叫做老王"),
    theme: await save(
      "Verify both themes",
      "UI checks cover the light and the dark theme",
    ),
  };
}

const titles = async (provider: BuiltinMemoryProvider, query: string) =>
  (await provider.recall({ query, limit: 8, project: null })).items.map(
    (item) => item.title,
  );

describe("built-in memory provider", () => {
  it("recalls Chinese and English memories from a whole user message", async () => {
    const provider = createProvider();
    await seed(provider);

    expect(await titles(provider, "我们上次说的发版流程是什么来着？")).toEqual([
      "发版流程：先发 beta 再转正",
    ]);
    expect(await titles(provider, "称呼")).toEqual(["称呼"]);
    expect(
      await titles(provider, "Did we check the dark theme for this screen?"),
    ).toEqual(["Verify both themes"]);
  });

  it("returns nothing for a message that only shares a stray word", async () => {
    const provider = createProvider();
    await seed(provider);

    expect(
      await titles(
        provider,
        "Please rename the helper and check the build output afterwards",
      ),
    ).toEqual([]);
    expect(await titles(provider, "今天天气怎么样，帮我查一下")).toEqual([]);
  });

  it("keeps recall inside the requested partition", async () => {
    const provider = createProvider();
    await provider.remember({
      title: "Prefers tea",
      content: "Green tea in the morning",
      project: "cocurdex/me",
    });
    await provider.remember({
      title: "Tea order for the coach",
      content: "Black tea after training",
      project: "cocurdex/agent/coach",
    });

    const recalled = await provider.recall({
      query: "tea",
      limit: 8,
      project: "cocurdex/me",
    });
    expect(recalled.items.map((item) => item.title)).toEqual(["Prefers tea"]);
  });

  it("offers a similar memory instead of storing a duplicate", async () => {
    const provider = createProvider();
    const { release } = await seed(provider);

    const result = await provider.remember({
      title: "发版流程：beta 之后转正",
      content: "先发 beta，再转正",
    });
    expect(result).toMatchObject({ action: "candidates", id: null });
    expect(result.candidates.map((item) => item.id)).toEqual([release]);
    expect(
      await provider.list({ limit: 50, since: null, project: null }),
    ).toHaveLength(3);
  });

  it("hides a superseded memory from recall and deletes merged ones", async () => {
    const provider = createProvider();
    const { release, theme } = await seed(provider);

    const replaced = await provider.remember({
      title: "发版流程：每天自动出 beta",
      content: "不再手动打 beta 标签",
      supersedes: [release],
    });
    expect(await titles(provider, "发版流程")).toEqual([
      "发版流程：每天自动出 beta",
    ]);

    const merged = await provider.remember({
      title: "Verify light and dark themes",
      content: "Every UI check covers both themes",
      mergeIds: [theme],
    });
    expect(merged.action).toBe("merged");
    expect((await provider.show(theme)).entry).toBeNull();
    expect((await provider.show(replaced.id as string)).entry).not.toBeNull();
  });

  it("restores a forgotten memory and records each change", async () => {
    const provider = createProvider();
    const { address } = await seed(provider);
    const before = await provider.revision();

    await provider.update({ id: address.slice(0, 8), content: "叫我老王就行" });
    await provider.forget(address);
    expect(await titles(provider, "称呼")).toEqual([]);
    await provider.restore(address);

    expect((await provider.show(address)).entry?.content).toBe("叫我老王就行");
    expect(
      (await provider.history({ id: address, limit: 10 })).map(
        (row) => row.action,
      ),
    ).toEqual(["restore", "delete", "update", "create"]);
    expect(Number(await provider.revision())).toBeGreaterThan(Number(before));
  });

  it("lists memories that are still deleted however much changed since", async () => {
    const provider = createProvider();
    const { release, theme, address } = await seed(provider);
    await provider.forget(release);
    await provider.forget(theme);
    await provider.restore(theme);
    for (const content of ["one", "two", "three"]) {
      await provider.update({ id: address, content });
    }

    const deleted = await provider.history({
      id: null,
      limit: 2,
      deleted: true,
    });
    expect(deleted.map((row) => [row.entryId, row.action])).toEqual([
      [release, "delete"],
    ]);
  });

  it("imports an exported file once, keeping ids", async () => {
    const source = createProvider();
    const { release } = await seed(source);
    const file = path.join(
      await temp.create("cocurdex-memory-"),
      "export.json",
    );
    await source.exportTo(file);

    const target = createProvider();
    expect(await target.importFrom(file)).toMatchObject({ imported: 3 });
    expect(await target.importFrom(file)).toMatchObject({
      imported: 0,
      duplicates: 3,
    });
    expect((await target.show(release)).entry?.title).toBe(
      "发版流程：先发 beta 再转正",
    );
  });
});
