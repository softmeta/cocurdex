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
});
