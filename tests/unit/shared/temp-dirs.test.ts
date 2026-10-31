import { existsSync } from "node:fs";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { describe, expect, it } from "vitest";

describe("createTempDirs", () => {
  it("releases registered resources, newest first, before removing directories", async () => {
    const tempDirs = createTempDirs();
    const directory = tempDirs.createSync("cocu-temp-dirs-");
    const released: string[] = [];
    tempDirs.onCleanup(() => {
      released.push(`first:${existsSync(directory)}`);
    });
    tempDirs.onCleanup(async () => {
      released.push(`second:${existsSync(directory)}`);
    });

    await tempDirs.cleanup();

    expect(released).toEqual(["second:true", "first:true"]);
    expect(existsSync(directory)).toBe(false);
  });

  it("still removes directories when releasing a resource fails, then reports it", async () => {
    const tempDirs = createTempDirs();
    const directory = await tempDirs.create("cocu-temp-dirs-");
    tempDirs.onCleanup(() => {
      throw new Error("close failed");
    });

    await expect(tempDirs.cleanup()).rejects.toThrow("close failed");
    expect(existsSync(directory)).toBe(false);
  });
});
