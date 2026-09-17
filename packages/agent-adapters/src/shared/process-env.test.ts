import { describe, expect, it } from "vitest";
import { sanitizeChildProcessEnv } from "./process-env";

describe("sanitizeChildProcessEnv", () => {
  it("forwards Cursor and Devin CLI auth env without leaking unrelated secrets", () => {
    const env = sanitizeChildProcessEnv({
      PATH: "/usr/bin",
      HOME: "/Users/test",
      CURSOR_API_KEY: "cursor-key",
      CURSOR_AUTH_TOKEN: "cursor-token",
      WINDSURF_API_KEY: "windsurf-key",
      DEVIN_API_KEY: "devin-key",
      UNRELATED_SECRET: "nope",
    });

    expect(env).toMatchObject({
      PATH: "/usr/bin",
      HOME: "/Users/test",
      CURSOR_API_KEY: "cursor-key",
      CURSOR_AUTH_TOKEN: "cursor-token",
      WINDSURF_API_KEY: "windsurf-key",
      DEVIN_API_KEY: "devin-key",
    });
    expect(env.UNRELATED_SECRET).toBeUndefined();
  });
});
