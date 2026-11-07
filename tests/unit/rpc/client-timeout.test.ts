import { daemonRequestTimeout } from "@cocurdex/rpc/internal/client-timeout";
import { describe, expect, it } from "vitest";

describe("daemonRequestTimeout", () => {
  it("keeps the default budget for ordinary methods", () => {
    expect(daemonRequestTimeout("app.bootstrap")).toBe(30_000);
  });

  it("allows ACP browser authorization to reach the provider's deadline", () => {
    expect(daemonRequestTimeout("agent.login")).toBeGreaterThan(5 * 60_000);
    expect(daemonRequestTimeout("agent.login.cancel")).toBe(30_000);
  });

  it("gives memory operations that call rsrs more than the default", () => {
    expect(daemonRequestTimeout("memory.session.save")).toBeGreaterThan(30_000);
    expect(daemonRequestTimeout("memory.remember")).toBeGreaterThan(30_000);
    expect(daemonRequestTimeout("memory.install")).toBeGreaterThan(30_000);
    expect(daemonRequestTimeout("memory.doctor")).toBeGreaterThan(30_000);
    expect(daemonRequestTimeout("memory.recall")).toBeGreaterThan(30_000);
  });
});
