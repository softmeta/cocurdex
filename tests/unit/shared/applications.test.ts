import {
  applicationAllows,
  isManagedApplicationServer,
  readApplicationMetadata,
  withApplicationMetadata,
} from "@cocurdex/shared/internal/applications";
import { describe, expect, it } from "vitest";

const metadata = {
  version: 1 as const,
  applicationId: "notion" as const,
  displayName: "Work notes",
  allPersonas: false,
  personaIds: ["assistant-a"],
  allowDelegatedWork: false,
  allowWorkSessions: false,
  revision: "revision-1",
  createdAt: "2026-11-07T00:00:00.000Z",
  updatedAt: "2026-11-07T00:00:00.000Z",
};
const server = withApplicationMetadata(
  { url: "https://mcp.notion.com/mcp" },
  metadata,
);

describe("managed application grants", () => {
  const persona = (personaId: string | null, delegated = false) => ({
    personaId,
    delegated,
    workSession: false,
  });
  const workSession = { personaId: null, delegated: false, workSession: true };

  it("grants only the selected assistant and requires separate permission for delegated work", () => {
    expect(applicationAllows(server, persona("assistant-a"))).toBe(true);
    expect(applicationAllows(server, persona("assistant-b"))).toBe(false);
    expect(applicationAllows(server, persona(null))).toBe(false);
    expect(applicationAllows(server, persona("assistant-a", true))).toBe(false);
    const delegated = withApplicationMetadata(server, {
      ...metadata,
      allowDelegatedWork: true,
    });
    expect(applicationAllows(delegated, persona("assistant-a", true))).toBe(
      true,
    );
    expect(
      applicationAllows(
        { ...delegated, enabled: false },
        persona("assistant-a", true),
      ),
    ).toBe(false);
  });

  it("grants every assistant when open to all, still gating delegated work", () => {
    const open = withApplicationMetadata(server, {
      ...metadata,
      allPersonas: true,
    });
    expect(applicationAllows(open, persona("assistant-b"))).toBe(true);
    expect(applicationAllows(open, persona("assistant-b", true))).toBe(false);
    expect(applicationAllows(open, persona(null))).toBe(false);
  });

  it("opens a connection to work sessions only when it allows them", () => {
    expect(applicationAllows(server, workSession)).toBe(false);
    const open = withApplicationMetadata(server, {
      ...metadata,
      allowWorkSessions: true,
    });
    expect(applicationAllows(open, workSession)).toBe(true);
    expect(applicationAllows({ ...open, enabled: false }, workSession)).toBe(
      false,
    );
    expect(applicationAllows(open, persona(null, true))).toBe(false);
  });

  it("reads a connection saved before work sessions existed as closed to them", () => {
    const {
      allowWorkSessions: _omitted,
      allPersonas: _added,
      ...legacy
    } = metadata;
    const saved = {
      url: "https://mcp.notion.com/mcp",
      cocurdex: { application: legacy },
    };
    expect(readApplicationMetadata(saved)).toEqual(metadata);
    expect(applicationAllows(saved, persona("assistant-a"))).toBe(true);
    expect(applicationAllows(saved, workSession)).toBe(false);
  });

  it.each([
    null,
    [],
    { ...metadata, version: 2 },
    { ...metadata, personaIds: "assistant-a" },
    { ...metadata, allowDelegatedWork: "true" },
    { ...metadata, allowWorkSessions: "true" },
  ])(
    "keeps malformed managed entries out of native injection and denies their grants",
    (application) => {
      const invalid = {
        url: "https://mcp.notion.com/mcp",
        cocurdex: { application },
      };
      expect(isManagedApplicationServer(invalid)).toBe(true);
      expect(readApplicationMetadata(invalid)).toBeNull();
      expect(applicationAllows(invalid, persona("assistant-a"))).toBe(false);
      expect(applicationAllows(invalid, workSession)).toBe(false);
    },
  );

  it("preserves existing MCP configuration fields and extensions", () => {
    const original = {
      url: "https://mcp.notion.com/mcp",
      oauth: { clientName: "Cocurdex" },
      tools: ["search"],
      cocurdex: { agents: ["pi"], custom: "retained" },
    };
    const managed = withApplicationMetadata(original, metadata);
    expect(managed).toMatchObject(original);
    expect(readApplicationMetadata(managed)).toEqual(metadata);
    expect(isManagedApplicationServer(original)).toBe(false);
    expect(readApplicationMetadata(original)).toBeNull();
  });
  it("returns only the public metadata contract from an extended configuration", () => {
    const extended = {
      ...server,
      cocurdex: {
        application: { ...metadata, privateExtra: "must-not-escape" },
      },
    };
    expect(readApplicationMetadata(extended)).toEqual(metadata);
    expect(JSON.stringify(readApplicationMetadata(extended))).not.toContain(
      "must-not-escape",
    );
  });
});
