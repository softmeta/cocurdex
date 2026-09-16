import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCRIPT_RUN_SETTINGS,
  extractJsonReply,
  parseScriptRunSettings,
  renderScriptRunReport,
  SCRIPT_RUN_HARD_MAX_AGENTS,
  type ScriptRunRecord,
} from "./script-run";

describe("parseScriptRunSettings", () => {
  it("falls back to defaults for missing or malformed settings", () => {
    expect(parseScriptRunSettings(null)).toEqual(DEFAULT_SCRIPT_RUN_SETTINGS);
    expect(parseScriptRunSettings("not json")).toEqual(
      DEFAULT_SCRIPT_RUN_SETTINGS,
    );
    expect(DEFAULT_SCRIPT_RUN_SETTINGS).toEqual({
      defaultMaxAgents: 5,
      schemaMaxAttempts: 3,
      maxDurationMinutes: null,
    });
  });

  it("keeps valid values and clamps out-of-range ones", () => {
    expect(
      parseScriptRunSettings(
        JSON.stringify({
          defaultMaxAgents: 5000,
          schemaMaxAttempts: 0,
          maxDurationMinutes: 90,
        }),
      ),
    ).toEqual({
      defaultMaxAgents: SCRIPT_RUN_HARD_MAX_AGENTS,
      schemaMaxAttempts: 1,
      maxDurationMinutes: 90,
    });
    expect(
      parseScriptRunSettings(
        JSON.stringify({ defaultMaxAgents: 2.5, maxDurationMinutes: -1 }),
      ),
    ).toEqual({ ...DEFAULT_SCRIPT_RUN_SETTINGS, maxDurationMinutes: null });
  });
});

describe("extractJsonReply", () => {
  it("parses a reply that is only JSON", () => {
    expect(extractJsonReply(' {"files": ["a.ts"]} ')).toEqual({
      ok: true,
      value: { files: ["a.ts"] },
    });
  });

  it("parses the last fenced json block in prose", () => {
    const reply = [
      "Draft:",
      "```json",
      '{"files": []}',
      "```",
      "Final:",
      "```json",
      '{"files": ["b.ts"]}',
      "```",
    ].join("\n");
    expect(extractJsonReply(reply)).toEqual({
      ok: true,
      value: { files: ["b.ts"] },
    });
  });

  it("fails on prose without JSON", () => {
    expect(extractJsonReply("All routes look fine.")).toEqual({ ok: false });
  });
});

describe("renderScriptRunReport", () => {
  const run: ScriptRunRecord = {
    id: "run-1",
    workspaceId: "w-1",
    requesterSessionId: "s-1",
    name: "audit-routes",
    script: "return 1;",
    status: "completed",
    maxAgents: 5,
    agentCount: 3,
    resultJson: '["a.ts"]',
    error: null,
    createdAt: "",
    startedAt: "",
    completedAt: "",
  };

  it("includes the result of a completed run", () => {
    expect(renderScriptRunReport(run)).toBe(
      '[Script run "audit-routes" completed with 3 agents]\n["a.ts"]',
    );
  });

  it("includes the error of a failed run", () => {
    expect(
      renderScriptRunReport({
        ...run,
        status: "failed",
        resultJson: null,
        error: "Agent limit of 5 reached",
      }),
    ).toBe(
      '[Script run "audit-routes" failed with 3 agents]\nAgent limit of 5 reached',
    );
  });
});
