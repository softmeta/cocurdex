import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileExists } from "./workspace-service";

describe("fileExists", () => {
  let dir: string;
  let filePath: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "file-exists-"));
    filePath = join(dir, "note.txt");
    await writeFile(filePath, "hello", "utf8");
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns true for an existing regular file", async () => {
    expect(await fileExists(filePath)).toBe(true);
  });

  it("returns false for a directory", async () => {
    expect(await fileExists(dir)).toBe(false);
  });

  it("returns false for a missing path", async () => {
    expect(await fileExists(join(dir, "missing.txt"))).toBe(false);
  });
});
