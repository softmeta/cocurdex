import { describe, expect, it } from "vitest";
import {
  compareAgentVersions,
  getAgentVersionStatus,
  parseAgentVersion,
} from "./agent-versions";

describe("parseAgentVersion", () => {
  it("extracts the version from each CLI's own output shape", () => {
    expect(parseAgentVersion("2.1.239 (Claude Code)")).toBe("2.1.239");
    expect(parseAgentVersion("codex-cli 0.149.0")).toBe("0.149.0");
    expect(parseAgentVersion("1.18.18")).toBe("1.18.18");
    expect(parseAgentVersion("grok 1.0.8 (95f4d452703b)")).toBe("1.0.8");
    expect(parseAgentVersion("v2.0.0-beta.3")).toBe("2.0.0-beta.3");
  });

  it("returns null when no version is present", () => {
    expect(parseAgentVersion("command not found")).toBeNull();
    expect(parseAgentVersion(null)).toBeNull();
  });
});

describe("compareAgentVersions", () => {
  it("orders by numeric segment, not lexically", () => {
    expect(compareAgentVersions("1.10.0", "1.9.0")).toBe(1);
    expect(compareAgentVersions("2.0.0", "10.0.0")).toBe(-1);
    expect(compareAgentVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("treats missing segments as zero and ignores prereleases", () => {
    expect(compareAgentVersions("1.2", "1.2.0")).toBe(0);
    expect(compareAgentVersions("1.2.0-beta.1", "1.2.0")).toBe(0);
  });
});

describe("getAgentVersionStatus", () => {
  it("flags installs below the adapter's floor", () => {
    expect(getAgentVersionStatus("claude-agent", "1.9.9")).toBe("outdated");
    expect(getAgentVersionStatus("claude-agent", "2.1.239 (Claude Code)")).toBe(
      "ok",
    );
  });

  it("accepts anything when the adapter has no floor", () => {
    expect(getAgentVersionStatus("codex", "0.1.0")).toBe("ok");
    expect(getAgentVersionStatus("pi", null)).toBe("ok");
  });

  it("reports unknown when a pinned adapter reports no parsable version", () => {
    expect(getAgentVersionStatus("opencode", null)).toBe("unknown");
  });
});
