import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("daemon client source export", () => {
  it("loads directly in Node ESM with type stripping", () => {
    const clientUrl = new URL("./client.ts", import.meta.url).href;
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--input-type=module",
        "--eval",
        `await import(${JSON.stringify(clientUrl)})`,
      ],
      { encoding: "utf8" },
    );

    expect(result.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
    expect(result.status).toBe(0);
  });
});
