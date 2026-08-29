import { describe, expect, it } from "vitest";
import {
  PROVIDER_SESSION_STATE_SCHEMA_VERSION,
  serializeProviderSessionState,
} from "./provider-session-state";

describe("serializeProviderSessionState", () => {
  it("stamps every provider cursor with the shared schema version", () => {
    const state = { adapter: "codex", threadId: "thread-1" };

    expect(JSON.parse(serializeProviderSessionState(state))).toEqual({
      ...state,
      schemaVersion: PROVIDER_SESSION_STATE_SCHEMA_VERSION,
    });
    expect(state).toEqual({ adapter: "codex", threadId: "thread-1" });
  });

  it("overwrites a caller supplied version so adapters cannot drift", () => {
    expect(
      JSON.parse(
        serializeProviderSessionState({
          adapter: "pi",
          schemaVersion: 99,
        }),
      ),
    ).toMatchObject({
      adapter: "pi",
      schemaVersion: PROVIDER_SESSION_STATE_SCHEMA_VERSION,
    });
  });
});
