import { describe, expect, it } from "vitest";
import {
  runScript,
  ScriptAbortedError,
  type ScriptHost,
  ScriptRejectedError,
} from "./script-sandbox";

function fakeHost(reply: (prompt: string) => unknown = (prompt) => prompt) {
  const prompts: string[] = [];
  const logs: string[] = [];
  const host: ScriptHost = {
    agent: async (prompt) => {
      prompts.push(prompt);
      await Promise.resolve();
      return reply(prompt);
    },
    log: (message) => logs.push(message),
  };
  return { host, prompts, logs };
}

function options(overrides: { signal?: AbortSignal } = {}) {
  return {
    maxListItems: 4,
    signal: overrides.signal ?? new AbortController().signal,
  };
}

describe("runScript", () => {
  it("supports top-level await and serializable return values", async () => {
    const { host, logs } = fakeHost((prompt) => ({ echo: prompt }));
    const result = await runScript(
      `const found = await agent("list");
       log("found", found.echo);
       return { found };`,
      host,
      options(),
    );
    expect(result).toEqual({ found: { echo: "list" } });
    expect(logs).toEqual(["found list"]);
  });

  it("keeps pipeline results in item order and nulls in place", async () => {
    const { host } = fakeHost((prompt) => (prompt === "b" ? null : prompt));
    const result = await runScript(
      `return await pipeline(["a", "b", "c"], (item) => agent(item));`,
      host,
      options(),
    );
    expect(result).toEqual(["a", null, "c"]);
  });

  it("runs parallel tasks and returns their results in order", async () => {
    const { host, prompts } = fakeHost();
    const result = await runScript(
      `return await parallel([() => agent("x"), () => agent("y")]);`,
      host,
      options(),
    );
    expect(result).toEqual(["x", "y"]);
    expect([...prompts].sort()).toEqual(["x", "y"]);
  });

  it("rejects lists longer than the item limit", async () => {
    const { host, prompts } = fakeHost();
    await expect(
      runScript(
        `return await pipeline([1, 2, 3, 4, 5], (item) => agent(String(item)));`,
        host,
        options(),
      ),
    ).rejects.toThrow(/at most 4 items/);
    expect(prompts).toEqual([]);
  });

  it("rejects dynamic imports and syntax errors before running", async () => {
    const { host, prompts } = fakeHost();
    await expect(
      runScript(`await agent("a"); await import("node:fs");`, host, options()),
    ).rejects.toBeInstanceOf(ScriptRejectedError);
    await expect(
      runScript(`await agent("a"); return (`, host, options()),
    ).rejects.toBeInstanceOf(ScriptRejectedError);
    expect(prompts).toEqual([]);
  });

  it("allows words like process in prompts", async () => {
    const { host } = fakeHost();
    expect(
      await runScript(
        `return await agent("audit the process module");`,
        host,
        options(),
      ),
    ).toBe("audit the process module");
  });

  it("does not expose host globals to the script", async () => {
    const { host } = fakeHost();
    expect(
      await runScript(
        `return [typeof process, typeof require, typeof fetch];`,
        host,
        options(),
      ),
    ).toEqual(["undefined", "undefined", "undefined"]);
  });

  it("terminates a script stuck in a loop after an await when aborted", async () => {
    const controller = new AbortController();
    const { host } = fakeHost((prompt) => {
      setTimeout(() => controller.abort("cancelled"), 50);
      return prompt;
    });
    await expect(
      runScript(
        `await agent("start"); while (true) {}`,
        host,
        options({ signal: controller.signal }),
      ),
    ).rejects.toBeInstanceOf(ScriptAbortedError);
  });

  it("does not call the host after an abort", async () => {
    const controller = new AbortController();
    const { host, prompts } = fakeHost((prompt) => {
      controller.abort("cancelled");
      return prompt;
    });
    await expect(
      runScript(
        `await agent("first"); await agent("second");`,
        host,
        options({ signal: controller.signal }),
      ),
    ).rejects.toBeInstanceOf(ScriptAbortedError);
    expect(prompts).toEqual(["first"]);
  });

  it("surfaces runtime errors thrown by the script", async () => {
    const { host } = fakeHost();
    await expect(
      runScript(`throw new Error("bad plan");`, host, options()),
    ).rejects.toThrow("bad plan");
  });

  it("passes agent options through and validates arguments", async () => {
    const seen: unknown[] = [];
    const host: ScriptHost = {
      agent: async (_prompt, agentOptions) => {
        seen.push(agentOptions);
        return "ok";
      },
      log: () => {},
    };
    await runScript(
      `await agent("a", { label: "one", worktree: true });`,
      host,
      options(),
    );
    expect(seen).toEqual([{ label: "one", worktree: true }]);
    await expect(
      runScript(`await agent(42);`, host, options()),
    ).rejects.toThrow(/prompt must be a string/);
  });
});
