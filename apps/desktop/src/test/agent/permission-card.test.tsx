import type { AgentPermissionRequestRecord } from "@cocurdex/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PermissionCard } from "@/features/agent/permission/permission-card";

const command =
  'git diff --stat && echo "===" && echo "STAGED ONLY, NOT IN UNSTAGED"';

const permission = {
  id: "permission-1",
  sessionId: "session-1",
  providerId: "grok-build",
  kind: "execute",
  title: "Execute command",
  description: null,
  rawInput: {
    input: {
      command,
    },
  },
  locations: [],
  options: [
    {
      id: "reject-always",
      kind: "reject_always",
      label: "Reject always",
    },
    {
      id: "allow-once",
      kind: "allow_once",
      label: "Allow once",
    },
  ],
  status: "pending",
  createdAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
} satisfies AgentPermissionRequestRecord;

describe("PermissionCard", () => {
  it("renders only the permission choices offered by the agent", () => {
    const onResolve = vi.fn();

    render(<PermissionCard onResolve={onResolve} permission={permission} />);

    expect(
      screen.queryByRole("button", { name: "Always allow" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reject always" }));

    expect(onResolve).toHaveBeenCalledWith(permission.id, "reject_always");
  });
});
