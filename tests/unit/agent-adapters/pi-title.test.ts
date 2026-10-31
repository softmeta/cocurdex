import { withOpenCodeSession } from "@cocurdex/agent-adapters/internal/pi-sdk/pi-title";
import type { ProviderConfigRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function provider(id: string) {
  return { id } as ProviderConfigRecord;
}

describe("withOpenCodeSession", () => {
  it("adds the routing header the opencode gateway requires", () => {
    expect(
      withOpenCodeSession(provider("opencode-go"), undefined, "session-1"),
    ).toEqual({ "x-opencode-session": "session-1" });
    expect(
      withOpenCodeSession(provider("opencode"), undefined, "session-1"),
    ).toEqual({ "x-opencode-session": "session-1" });
  });

  it("keeps a header the provider already configures", () => {
    expect(
      withOpenCodeSession(
        provider("opencode-go"),
        { "X-OpenCode-Session": "explicit" },
        "session-1",
      ),
    ).toEqual({ "X-OpenCode-Session": "explicit" });
  });

  it("leaves other providers and a missing session id alone", () => {
    expect(
      withOpenCodeSession(provider("openai"), undefined, "session-1"),
    ).toBeUndefined();
    expect(
      withOpenCodeSession(provider("opencode-go"), undefined, undefined),
    ).toBeUndefined();
  });
});
