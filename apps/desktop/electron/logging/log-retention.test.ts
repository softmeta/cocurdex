import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pruneLogFiles } from "./log-retention";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("pruneLogFiles", () => {
  let directory = "";

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "cocurdex-logs-"));
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  async function writeFileWithAge(name: string, ageMs: number, now: number) {
    const filePath = path.join(directory, name);
    await fs.writeFile(filePath, "x");
    const time = new Date(now - ageMs);
    await fs.utimes(filePath, time, time);
    return filePath;
  }

  it("removes files older than the retention window and keeps fresh ones", async () => {
    const now = Date.now();
    const stale = await writeFileWithAge("old.log", 8 * DAY_MS, now);
    const fresh = await writeFileWithAge("new.log", 1 * DAY_MS, now);

    const removed = await pruneLogFiles(directory, { retentionDays: 7, now });

    expect(removed).toEqual([stale]);
    await expect(fs.access(fresh)).resolves.toBeUndefined();
    await expect(fs.access(stale)).rejects.toThrow();
  });

  it("ignores files that do not match the suffix", async () => {
    const now = Date.now();
    await writeFileWithAge("keep.txt", 30 * DAY_MS, now);

    const removed = await pruneLogFiles(directory, { retentionDays: 7, now });

    expect(removed).toEqual([]);
  });

  it("applies maxFiles only after day-based pruning, dropping oldest first", async () => {
    const now = Date.now();
    const oldest = await writeFileWithAge("a.log", 3 * DAY_MS, now);
    await writeFileWithAge("b.log", 2 * DAY_MS, now);
    await writeFileWithAge("c.log", 1 * DAY_MS, now);

    const removed = await pruneLogFiles(directory, {
      retentionDays: 7,
      maxFiles: 2,
      now,
    });

    expect(removed).toEqual([oldest]);
  });

  it("returns an empty list when the directory does not exist", async () => {
    const removed = await pruneLogFiles(path.join(directory, "missing"), {
      retentionDays: 7,
    });

    expect(removed).toEqual([]);
  });
});
