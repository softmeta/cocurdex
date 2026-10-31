import { buildTerminalEnv } from "@cocurdex/daemon/internal/terminal/terminal-env";
import { describe, expect, it } from "vitest";

describe("buildTerminalEnv", () => {
  it("keeps the user environment and drops daemon-only variables", () => {
    const env = buildTerminalEnv({
      COCURDEX_DAEMON_OWNER_FD: "3",
      COCURDEX_DAEMON_TOKEN: "secret",
      COCURDEX_USER_DATA_PATH: "/data",
      COCURDEX_WEB_ROOT: "/web",
      ELECTRON_RUN_AS_NODE: "1",
      PATH: "/usr/bin",
    });

    expect(env).toEqual({
      COCURDEX_USER_DATA_PATH: "/data",
      COLORTERM: "truecolor",
      LANG: "en_US.UTF-8",
      PATH: "/usr/bin",
      TERM: "xterm-256color",
    });
  });

  it("preserves terminal settings the user already exported", () => {
    const env = buildTerminalEnv({ LANG: "zh_CN.UTF-8", TERM: "screen" });

    expect(env.LANG).toBe("zh_CN.UTF-8");
    expect(env.TERM).toBe("screen");
  });
});
