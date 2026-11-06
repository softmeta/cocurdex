import {
  applicationAllowsPersona,
  isManagedApplicationServer,
  readApplicationMetadata,
  withApplicationMetadata,
} from "@cocurdex/shared/internal/applications";
import { describe, expect, it } from "vitest";

const metadata = {
  version: 1 as const,
  applicationId: "notion" as const,
  displayName: "Work notes",
  personaIds: ["assistant-a"],
  allowDelegatedWork: false,
  revision: "revision-1",
  createdAt: "2026-11-07T00:00:00.000Z",
  updatedAt: "2026-11-07T00:00:00.000Z",
};
const server = withApplicationMetadata(
  { url: "https://mcp.notion.com/mcp" },
  metadata,
);

describe("managed application grants", () => {
  it("grants only the selected assistant and requires separate permission for delegated work", () => {
    expect(applicationAllowsPersona(server, "assistant-a", false)).toBe(true);
    expect(applicationAllowsPersona(server, "assistant-b", false)).toBe(false);
    expect(applicationAllowsPersona(server, null, false)).toBe(false);
    expect(applicationAllowsPersona(server, "assistant-a", true)).toBe(false);
    const delegated = withApplicationMetadata(server, {
      ...metadata,
      allowDelegatedWork: true,
    });
    expect(applicationAllowsPersona(delegated, "assistant-a", true)).toBe(true);
    expect(
      applicationAllowsPersona(
        { ...delegated, enabled: false },
        "assistant-a",
        true,
      ),
    ).toBe(false);
  });

  it.each([
    null,
    [],
    { ...metadata, version: 2 },
    { ...metadata, personaIds: "assistant-a" },
    { ...metadata, allowDelegatedWork: "true" },
  ])(
    "keeps malformed managed entries out of native injection and denies their grants",
    (application) => {
      const invalid = {
        url: "https://mcp.notion.com/mcp",
        cocurdex: { application },
      };
      expect(isManagedApplicationServer(invalid)).toBe(true);
      expect(readApplicationMetadata(invalid)).toBeNull();
      expect(applicationAllowsPersona(invalid, "assistant-a", false)).toBe(
        false,
      );
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
