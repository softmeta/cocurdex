import { describe, expect, it } from "vitest";
import { resolveDaemonRequestArgs } from "./client.ts";

describe("resolveDaemonRequestArgs", () => {
  it("keeps client options out of the payload for no-param methods", () => {
    const resolved = resolveDaemonRequestArgs("network.proxy.test", [
      { userDataPath: "/tmp/cocurdex-dev" },
    ]);
    expect(resolved.params).toBeUndefined();
    expect(resolved.options).toEqual({ userDataPath: "/tmp/cocurdex-dev" });
  });

  it("still reads params then options for methods that have a payload", () => {
    const resolved = resolveDaemonRequestArgs("session.stop", [
      { sessionId: "sess_1" },
      { userDataPath: "/tmp/cocurdex-dev" },
    ]);
    expect(resolved.params).toEqual({ sessionId: "sess_1" });
    expect(resolved.options).toEqual({ userDataPath: "/tmp/cocurdex-dev" });
  });

  it("rejects a params slot on no-param methods instead of dropping options", () => {
    expect(() =>
      resolveDaemonRequestArgs(
        "worktree.list",
        // @ts-expect-error covers untyped callers that pass a params slot
        [undefined, { userDataPath: "/tmp/cocurdex-dev" }],
      ),
    ).toThrow(/takes no params/);
  });

  it("rejects extra arguments on methods with a payload", () => {
    expect(() =>
      resolveDaemonRequestArgs(
        "session.stop",
        // @ts-expect-error covers untyped callers passing extra arguments
        [
          { sessionId: "sess_1" },
          { userDataPath: "/tmp/cocurdex-dev" },
          { userDataPath: "/tmp/other" },
        ],
      ),
    ).toThrow(/at most params and client options/);
  });
});
