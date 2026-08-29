import { describe, expect, it, vi } from "vitest";
import {
  applyShellEnv,
  isAgentEnvKey,
  mergeEnvPath,
  parseShellEnv,
} from "./resolve-shell-env";

const MARKER = "__COCURDEX_ENV__";

describe("parseShellEnv", () => {
  it("extracts key/value pairs between markers, ignoring login-shell noise", () => {
    const stdout = [
      "Welcome to your shell",
      MARKER,
      "PATH=/opt/homebrew/bin:/usr/bin",
      "ANTHROPIC_API_KEY=sk-ant-123",
      "HTTPS_PROXY=http://proxy:8080",
      MARKER,
      "",
    ].join("\n");

    expect(parseShellEnv(stdout, MARKER)).toEqual({
      PATH: "/opt/homebrew/bin:/usr/bin",
      ANTHROPIC_API_KEY: "sk-ant-123",
      HTTPS_PROXY: "http://proxy:8080",
    });
  });

  it("keeps values that themselves contain '='", () => {
    const stdout = `${MARKER}\nTOKEN=a=b=c\n${MARKER}`;

    expect(parseShellEnv(stdout, MARKER)).toEqual({ TOKEN: "a=b=c" });
  });

  it("returns null when no marker pair is present", () => {
    expect(parseShellEnv("no markers here", MARKER)).toBeNull();
  });

  it("returns null when no parsable pairs exist between markers", () => {
    expect(
      parseShellEnv(`${MARKER}\nnot-a-pair\n${MARKER}`, MARKER),
    ).toBeNull();
  });
});

describe("isAgentEnvKey", () => {
  it("accepts provider prefixes, proxy names, and secret suffixes", () => {
    expect(isAgentEnvKey("ANTHROPIC_API_KEY")).toBe(true);
    expect(isAgentEnvKey("COCURDEX_OPENCODE_DEBUG")).toBe(true);
    expect(isAgentEnvKey("OPENCODE_CONFIG")).toBe(true);
    expect(isAgentEnvKey("HTTPS_PROXY")).toBe(true);
    expect(isAgentEnvKey("DEEPSEEK_TOKEN")).toBe(true);
  });

  it("rejects unrelated host vars", () => {
    expect(isAgentEnvKey("SECRET_DIARY")).toBe(false);
    expect(isAgentEnvKey("RANDOM")).toBe(false);
  });
});

describe("mergeEnvPath", () => {
  it("prepends shell paths and drops duplicates while keeping order", () => {
    const merged = mergeEnvPath(
      "/usr/bin:/bin",
      "/opt/homebrew/bin:/usr/bin:/Users/x/.local/bin",
    );

    expect(merged).toBe("/opt/homebrew/bin:/usr/bin:/Users/x/.local/bin:/bin");
  });

  it("returns the shell path when the current PATH is empty", () => {
    expect(mergeEnvPath("", "/opt/homebrew/bin")).toBe("/opt/homebrew/bin");
  });
});

describe("applyShellEnv", () => {
  it("skips Windows, which already inherits a usable environment", () => {
    const env: NodeJS.ProcessEnv = { PATH: "C:\\Windows" };
    const resolveEnv = vi.fn(() => ({ PATH: "/opt/homebrew/bin" }));

    applyShellEnv({ platform: "win32", env, resolveEnv });

    expect(resolveEnv).not.toHaveBeenCalled();
    expect(env.PATH).toBe("C:\\Windows");
  });

  it("merges the resolved PATH and fills allowlisted vars on posix", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin" };

    applyShellEnv({
      platform: "darwin",
      env,
      resolveEnv: () => ({
        PATH: "/opt/homebrew/bin:/usr/bin",
        ANTHROPIC_API_KEY: "sk-ant-123",
        HTTPS_PROXY: "http://proxy:8080",
      }),
    });

    expect(env.PATH).toBe("/opt/homebrew/bin:/usr/bin:/bin");
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-123");
    expect(env.HTTPS_PROXY).toBe("http://proxy:8080");
  });

  it("never overwrites vars already present in the host env", () => {
    const env: NodeJS.ProcessEnv = {
      PATH: "/usr/bin",
      ANTHROPIC_API_KEY: "host-value",
    };

    applyShellEnv({
      platform: "darwin",
      env,
      resolveEnv: () => ({ ANTHROPIC_API_KEY: "shell-value" }),
    });

    expect(env.ANTHROPIC_API_KEY).toBe("host-value");
  });

  it("ignores keys outside the allowlist", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin" };

    applyShellEnv({
      platform: "darwin",
      env,
      resolveEnv: () => ({ SECRET_DIARY: "leaked" }),
    });

    expect(env.SECRET_DIARY).toBeUndefined();
  });

  it("leaves env untouched when the shell environment cannot be resolved", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin" };

    applyShellEnv({ platform: "darwin", env, resolveEnv: () => null });

    expect(env.PATH).toBe("/usr/bin:/bin");
  });
});
