import type { RequestPermissionRequest } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { mapPermissionDecision } from "./acp-mappers";

const request: RequestPermissionRequest = {
  sessionId: "provider-session-1",
  toolCall: {
    toolCallId: "tool-1",
    title: "Edit file",
    kind: "edit",
  },
  options: [
    { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
    { optionId: "allow-always", name: "Allow always", kind: "allow_always" },
    { optionId: "reject-once", name: "Reject once", kind: "reject_once" },
    {
      optionId: "reject-always",
      name: "Reject always",
      kind: "reject_always",
    },
  ],
};

describe("mapPermissionDecision", () => {
  it.each([
    ["allow_once", "allow-once"],
    ["allow_always", "allow-always"],
    ["reject_once", "reject-once"],
    ["reject_always", "reject-always"],
  ] as const)("selects the matching ACP option for %s", (decision, optionId) => {
    expect(mapPermissionDecision(request, decision)).toEqual({
      outcome: { outcome: "selected", optionId },
    });
  });

  it("preserves cancellation without selecting a rejection option", () => {
    expect(mapPermissionDecision(request, "cancelled")).toEqual({
      outcome: { outcome: "cancelled" },
    });
  });

  it("cancels when the requested decision kind was not offered", () => {
    expect(
      mapPermissionDecision(
        {
          ...request,
          options: request.options.filter(
            (option) => option.kind !== "allow_always",
          ),
        },
        "allow_always",
      ),
    ).toEqual({
      outcome: { outcome: "cancelled" },
    });
  });
});
