import { describe, expect, it } from "vitest";
import {
  buildOpenCodeProcessOptions,
  getOpenCodeDiagnosticEnvironment,
} from "./opencode-server";

describe("buildOpenCodeProcessOptions", () => {
  it("anchors the process to the workspace and removes ambient shell hooks", () => {
    const options = buildOpenCodeProcessOptions("/workspace", {
      BASH_ENV: "/Users/example/.bashrc",
      HOME: "/Users/example",
      OLDPWD: "/Users/example",
      OPENCODE_DB: "/Users/example/.local/share/opencode/opencode.db",
      PATH: "/usr/bin",
      PWD: "/Users/example",
    });

    expect(options.cwd).toBe("/workspace");
    expect(options.env).toMatchObject({
      HOME: "/Users/example",
      OPENCODE_CONFIG_CONTENT: "{}",
      OPENCODE_DB: "/Users/example/.local/share/opencode/opencode.db",
      PATH: "/usr/bin",
      PWD: "/workspace",
    });
    expect(options.env.BASH_ENV).toBeUndefined();
    expect(options.env.OLDPWD).toBeUndefined();
  });
});

describe("getOpenCodeDiagnosticEnvironment", () => {
  it("records only the environment that determines the host OpenCode runtime", () => {
    expect(
      getOpenCodeDiagnosticEnvironment({
        HOME: "/Users/example",
        OPENCODE_DB: "/Users/example/.local/share/opencode/opencode.db",
        OPENCODE_CONFIG_CONTENT: "{}",
        PATH: "/Users/example/.opencode/bin:/usr/bin",
        SECRET_API_KEY: "must-not-be-logged",
        XDG_DATA_HOME: "/Users/example/.local/share",
      }),
    ).toEqual({
      HOME: "/Users/example",
      OPENCODE_CHANNEL: null,
      OPENCODE_CLIENT: null,
      OPENCODE_CONFIG: null,
      OPENCODE_CONFIG_CONTENT: "{}",
      OPENCODE_CONFIG_DIR: null,
      OPENCODE_DB: "/Users/example/.local/share/opencode/opencode.db",
      PATH: "/Users/example/.opencode/bin:/usr/bin",
      PWD: null,
      XDG_DATA_HOME: "/Users/example/.local/share",
      XDG_STATE_HOME: null,
    });
  });
});
