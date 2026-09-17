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
      labelSource: "generic",
    },
    {
      id: "allow-once",
      kind: "allow_once",
      label: "Allow once",
      labelSource: "generic",
    },
  ],
  status: "pending",
  createdAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
} satisfies AgentPermissionRequestRecord;

const scopedPermission = {
  ...permission,
  providerId: "devin",
  options: [
    {
      id: "allow-session",
      kind: "allow_always",
      label: "Yes, allow `devin` commands (this session)",
      labelSource: "provider",
    },
    {
      id: "allow-project",
      kind: "allow_always",
      label: "Yes, always allow `devin` commands in `cocurdex`",
      labelSource: "provider",
    },
    {
      id: "allow-all-projects",
      kind: "allow_always",
      label: "Yes, always allow `devin` commands in all projects",
      labelSource: "provider",
    },
    {
      id: "reject-once",
      kind: "reject_once",
      label: "Reject",
      labelSource: "provider",
    },
  ],
  status: "pending",
} satisfies AgentPermissionRequestRecord;

describe("PermissionCard", () => {
  it("renders only the permission choices offered by the agent", () => {
    const onResolve = vi.fn();

    render(<PermissionCard onResolve={onResolve} permission={permission} />);

    expect(
      screen.queryByRole("button", { name: "Always allow" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reject always" }));

    expect(onResolve).toHaveBeenCalledWith(permission.id, "reject-always");
  });

  it("keeps same-kind provider choices distinguishable and resolves the chosen one", () => {
    const onResolve = vi.fn();

    render(
      <PermissionCard onResolve={onResolve} permission={scopedPermission} />,
    );

    expect(
      screen.getByRole("button", {
        name: "Yes, allow `devin` commands (this session)",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Yes, always allow `devin` commands in `cocurdex`",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Yes, always allow `devin` commands in all projects",
      }),
    );

    expect(onResolve).toHaveBeenCalledWith(
      scopedPermission.id,
      "allow-all-projects",
    );
  });
});
